/**
 * Host-half behaviour: config validation, the read-only inventory, every
 * refusal branch, and the ordering of an accepted deletion against a real
 * temporary Session directory.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, deleteSession, inspectSession, resolveConfig } from '../index.js'

const DAY = 86_400_000
const SESSION = 'session-11111111-2222-3333-4444-555555555555'

/** Build one Session directory below a fresh root and return its log path. */
async function sessionDir(root, id = SESSION, ageDays = 3) {
  const directory = join(root, 'projects', 'demo', 'sessions', id)
  await mkdir(directory, { recursive: true })
  const log = join(directory, 'session.v1.jsonl')
  await writeFile(log, '{"seq":0}\n')
  // The age guard reads the later of the header timestamp and the log's own
  // mtime, so a fixture that should look old must back-date the file too.
  const stamp = new Date(Date.now() - ageDays * DAY)
  await utimes(log, stamp, stamp)
  return { directory, log }
}

/** Minimal Host context double covering exactly the members the plugin reads. */
function makeContext(options = {}) {
  const removed = []
  const archived = new Set(options.archived ?? [])
  const pinned = new Set(options.pinned ?? [])
  const workspaces = options.workspaces ?? []
  const routes = new Map()
  const events = new Map()
  return {
    removed,
    routes,
    archived,
    pinned,
    logger: { info() {}, warn() {} },
    webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) } },
    sessionPersistence: {
      stat: options.stat ?? (async () => undefined),
      list: options.list ?? (async () => []),
    },
    sessionQuery: undefined,
    workspaceRegistry: {
      list: () => workspaces,
      get archivedSessionIds() { return [...archived] },
      get pinnedSessionIds() { return [...pinned] },
      archiveSession: async (id) => { archived.add(id) },
      unarchiveSession: async (id) => { archived.delete(id) },
      unpinSession: async (id) => { pinned.delete(id) },
    },
    waterfall: async (_name, _payload, next) => next(),
    parallel: async () => undefined,
    effect: (fn) => fn(),
    on: (name, listener) => {
      events.set(name, listener)
      return () => events.delete(name)
    },
    get: (name) => options.services?.[name],
  }
}

/** Build one stored-session snapshot. */
function snapshot(log, overrides = {}) {
  return {
    header: { id: SESSION, version: 1, createdAt: Date.now() - 3 * DAY, isSeeded: false, cwd: '/tmp/demo' },
    revision: 'test:1',
    sizeBytes: 2048,
    location: { kind: 'jsonl', path: log },
    ...overrides,
  }
}

test('resolveConfig validates every field and keeps the documented defaults', () => {
  assert.deepEqual(resolveConfig(undefined), {
    minAgeDays: 1,
    requireTitleConfirmation: true,
    deleteSpillArtifacts: true,
    worktreeTimeoutMs: 20000,
    spillRoots: [],
  })
  assert.equal(resolveConfig({ minAgeDays: 3 }).minAgeDays, 3)
  assert.equal(resolveConfig({ minAgeDays: 0 }).minAgeDays, 0)
  assert.throws(() => resolveConfig({ minAgeDays: -1 }), /non-negative/u)
  assert.throws(() => resolveConfig({ minAgeDays: '1' }), /non-negative/u)
  assert.throws(() => resolveConfig({ requireTitleConfirmation: 'yes' }), /boolean/u)
  assert.throws(() => resolveConfig({ spillRoots: [''] }), /non-empty strings/u)
  assert.throws(() => resolveConfig({ worktreeTimeoutMs: -5 }), /non-negative/u)
})

test('apply registers two owner-only POST routes', () => {
  const ctx = makeContext()
  apply(ctx, undefined)
  assert.deepEqual([...ctx.routes.keys()].sort(), ['/session-delete/delete', '/session-delete/inspect'])
  for (const route of ctx.routes.values()) {
    assert.equal(route.kind, 'exact')
    assert.equal(route.auth, 'required')
  }
})

test('inspect reports the inventory and blocks a missing session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const config = resolveConfig(undefined)
    const missing = await inspectSession(makeContext(), config, SESSION)
    assert.equal(missing.ok, false)
    assert.equal(missing.code, 'not-found')

    const ctx = makeContext({ stat: async () => snapshot(log) })
    const inspected = await inspectSession(ctx, config, SESSION)
    assert.equal(inspected.ok, true)
    assert.equal(inspected.data.eligible, true)
    assert.equal(inspected.data.sizeBytes, 2048)
    assert.deepEqual(inspected.data.reasons, [])
    assert.equal(inspected.data.directory !== null, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('inspect blocks a live session, an unsupported backend, a migration, and a too-recent session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const config = resolveConfig({ minAgeDays: 1 })

    const live = makeContext({
      stat: async () => snapshot(log),
      services: { sessions: { get: () => ({ header: {} }) } },
    })
    assert.equal((await inspectSession(live, config, SESSION)).data.reasons[0].code, 'session-live')

    const backend = makeContext({
      stat: async () => snapshot(log, { location: { kind: 'sqlite', path: log } }),
    })
    assert.equal((await inspectSession(backend, config, SESSION)).data.reasons[0].code, 'unsupported-backend')

    const migration = makeContext({
      stat: async () => snapshot(log, { formatStatus: 'migration-required' }),
    })
    assert.equal((await inspectSession(migration, config, SESSION)).data.reasons[0].code, 'migration-required')

    const recent = makeContext({
      stat: async () => snapshot(log, {
        header: { id: SESSION, version: 1, createdAt: Date.now(), isSeeded: false, cwd: '/tmp/demo' },
      }),
    })
    const inspected = await inspectSession(recent, config, SESSION)
    assert.equal(inspected.data.eligible, false)
    assert.ok(inspected.data.reasons.some(reason => reason.code === 'too-recent'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('delete refuses without acknowledgement, then needs a stop, then removes everything', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const workspace = {
      sessionIds: [SESSION],
      detached: [],
      async detachSession(id) { this.detached.push(id); this.sessionIds = this.sessionIds.filter(entry => entry !== id) },
    }
    const ctx = makeContext({
      stat: async () => snapshot(log),
      workspaces: [workspace],
      archived: [SESSION],
      pinned: [SESSION],
    })
    const config = resolveConfig(undefined)

    const unacknowledged = await deleteSession(ctx, config, { sessionId: SESSION })
    assert.equal(unacknowledged.code, 'title-required')

    ctx.waterfall = async () => [{ kind: 'schedule', id: 'task-1' }]
    const needsStop = await deleteSession(ctx, config, { sessionId: SESSION, confirmTitle: 'x', acknowledged: true })
    assert.equal(needsStop.code, 'needs-stop')
    assert.equal(needsStop.activity.length, 1)

    ctx.waterfall = async (_name, _payload, next) => next()
    const deleted = await deleteSession(ctx, config, { sessionId: SESSION, confirmTitle: 'x', acknowledged: true })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.data.status, 'deleted')
    await assert.rejects(stat(directory), /ENOENT/u)
    assert.deepEqual(workspace.detached, [SESSION])
    assert.equal(ctx.archived.has(SESSION), false)
    assert.equal(ctx.pinned.has(SESSION), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('delete stops planned work first when the caller asks for it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const calls = []
    const ctx = makeContext({ stat: async () => snapshot(log) })
    ctx.waterfall = async () => [{ kind: 'job', id: 'job-1' }]
    ctx.parallel = async (name) => { calls.push(name) }
    const deleted = await deleteSession(ctx, resolveConfig(undefined), {
      sessionId: SESSION, confirmTitle: 'x', acknowledged: true, stopActivity: true,
    })
    assert.equal(deleted.ok, true)
    assert.deepEqual(calls, ['workspace/session-stop'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing directory reports the failure and keeps the accounting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const workspace = { sessionIds: [SESSION], detached: [], async detachSession() { this.detached.push('x') } }
    const ctx = makeContext({ stat: async () => snapshot(log), workspaces: [workspace] })
    await rm(directory, { recursive: true, force: true })
    // A vanished directory is an idempotent success: removing it again changes nothing.
    const deleted = await deleteSession(ctx, resolveConfig(undefined), {
      sessionId: SESSION, confirmTitle: 'x', acknowledged: true,
    })
    assert.equal(deleted.ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})