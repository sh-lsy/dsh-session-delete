/**
 * Host-half behaviour: config validation, the read-only inventory, every
 * refusal branch, live-Session handling, and the ordering of an accepted
 * deletion against a real temporary Session directory.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, batchDelete, batchInspect, deleteSession, inspectSession, resolveConfig } from '../index.js'

const DAY = 86_400_000
const SESSION = 'session-11111111-2222-3333-4444-555555555555'

/** Build one Session directory below a fresh root and return its log path. */
async function sessionDir(root, id = SESSION, ageDays = 3) {
  const directory = join(root, 'projects', 'demo', 'sessions', id)
  await mkdir(directory, { recursive: true })
  const log = join(directory, 'session.v1.jsonl')
  await writeFile(log, '{"seq":0}\n')
  const stamp = new Date(Date.now() - ageDays * DAY)
  await utimes(log, stamp, stamp)
  return { directory, log }
}

/** Minimal Host context double covering exactly the members the plugin reads. */
function makeContext(options = {}) {
  const archived = new Set(options.archived ?? [])
  const pinned = new Set(options.pinned ?? [])
  const workspaces = options.workspaces ?? []
  const routes = new Map()
  const commands = []
  const agentState = { status: options.agentStatus ?? 'idle' }
  return {
    routes,
    commands,
    archived,
    pinned,
    agentState,
    logger: { info() {}, warn() {} },
    webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) } },
    sessionPersistence: {
      stat: options.stat ?? (async () => undefined),
      list: options.list ?? (async () => []),
      open: async (id) => ({
        id,
        read: async () => {
          if (options.failRead?.includes(id)) throw new Error('unreadable session')
          return { events: options.logs?.[id] ?? [] }
        },
        close: async () => {},
      }),
    },
    workspaceRegistry: {
      list: () => workspaces,
      get: (id) => workspaces.find(workspace => workspace.id === id),
      get archivedSessionIds() { return [...archived] },
      get pinnedSessionIds() { return [...pinned] },
      archiveSession: async (id) => { archived.add(id) },
      unarchiveSession: async (id) => { archived.delete(id) },
      unpinSession: async (id) => { pinned.delete(id) },
    },
    waterfall: async (_name, _payload, next) => next(),
    parallel: async () => undefined,
    effect: (fn) => fn(),
    on: () => () => {},
    inject: (_names, cb) => {
      cb({ effect: (fn) => fn(), commands: { register: (def) => { commands.push(def); return () => {} } } })
      return () => {}
    },
    get: (name) => {
      if (name === 'agents' && options.live === true) return { get: () => agentState }
      if (name === 'sessions' && options.live === true) return { get: () => ({ header: {} }) }
      return options.services?.[name]
    },
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
    requireTitleConfirmation: false,
    deleteSpillArtifacts: true,
    worktreeTimeoutMs: 20000,
    stopSettleMs: 8000,
    spillRoots: [],
    snapshotEnabled: true,
    retentionDays: 7,
    timeoutMs: 30000,
    outputMaxBytes: 8388608,
    dataRoot: '',
    snapshotExcludes: ['node_modules/', '.git/', '__pycache__/', '.venv/', 'venv/', '.next/', '.cache/', '.turbo/'],
  })
  assert.equal(resolveConfig({ requireTitleConfirmation: true }).requireTitleConfirmation, true)
  assert.equal(resolveConfig({ stopSettleMs: 0 }).stopSettleMs, 0)
  assert.equal(resolveConfig({ retentionDays: 14 }).retentionDays, 14)
  assert.throws(() => resolveConfig({ stopSettleMs: -1 }), /non-negative/u)
  assert.throws(() => resolveConfig({ worktreeTimeoutMs: '1' }), /non-negative/u)
  assert.throws(() => resolveConfig({ requireTitleConfirmation: 'yes' }), /boolean/u)
  assert.throws(() => resolveConfig({ spillRoots: [''] }), /non-empty strings/u)
})

test('apply registers the delete and undo owner-only POST routes', () => {
  const ctx = makeContext()
  apply(ctx, { dataRoot: join(tmpdir(), 'dsh-sd-apply-test') })
  assert.deepEqual([...ctx.routes.keys()].sort(), [
    '/session-delete/batch-delete',
    '/session-delete/batch-inspect',
    '/session-delete/delete',
    '/session-delete/inspect',
    '/session-undo/candidates',
    '/session-undo/clear-queue',
    '/session-undo/prepare',
    '/session-undo/preview',
    '/session-undo/purge',
    '/session-undo/snapshots',
  ])
  for (const route of ctx.routes.values()) {
    assert.equal(route.kind, 'exact')
    assert.equal(route.auth, 'required')
  }
  assert.deepEqual(ctx.commands.map(command => command.name), ['rewind'])
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
    assert.equal(inspected.data.live, false)
    assert.equal(inspected.data.sizeBytes, 2048)
    assert.deepEqual(inspected.data.reasons, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('inspect blocks an unsupported backend and a migration, but not a live or recent session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const config = resolveConfig(undefined)

    const backend = makeContext({ stat: async () => snapshot(log, { location: { kind: 'sqlite', path: log } }) })
    assert.equal((await inspectSession(backend, config, SESSION)).data.reasons[0].code, 'unsupported-backend')

    const migration = makeContext({ stat: async () => snapshot(log, { formatStatus: 'migration-required' }) })
    assert.equal((await inspectSession(migration, config, SESSION)).data.reasons[0].code, 'migration-required')

    // A Session opened this run, even one active today, is deletable.
    const live = makeContext({ stat: async () => snapshot(log), live: true, agentStatus: 'idle' })
    const inspected = await inspectSession(live, config, SESSION)
    assert.equal(inspected.data.eligible, true)
    assert.equal(inspected.data.live, true)
    assert.equal(inspected.data.runningTurn, false)

    const running = makeContext({ stat: async () => snapshot(log), live: true, agentStatus: 'running' })
    const runningInspected = await inspectSession(running, config, SESSION)
    assert.equal(runningInspected.data.eligible, true)
    assert.equal(runningInspected.data.runningTurn, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('delete needs no title by default, then needs a stop, then removes everything', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const workspace = {
      sessionIds: [SESSION],
      detached: [],
      async detachSession(id) { this.detached.push(id); this.sessionIds = this.sessionIds.filter(entry => entry !== id) },
    }
    const ctx = makeContext({ stat: async () => snapshot(log), workspaces: [workspace], archived: [SESSION], pinned: [SESSION] })
    const config = resolveConfig(undefined)

    ctx.waterfall = async () => [{ kind: 'schedule', id: 'task-1' }]
    const needsStop = await deleteSession(ctx, config, { sessionId: SESSION })
    assert.equal(needsStop.code, 'needs-stop')
    assert.equal(needsStop.activity.length, 1)

    ctx.waterfall = async (_name, _payload, next) => next()
    const deleted = await deleteSession(ctx, config, { sessionId: SESSION })
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

test('delete still honours an opt-in title confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const ctx = makeContext({
      stat: async () => snapshot(log),
      logs: { [SESSION]: [{ type: 'session/title', seq: 1, data: { title: 'My Session' } }] },
    })
    const config = resolveConfig({ requireTitleConfirmation: true })
    const refused = await deleteSession(ctx, config, { sessionId: SESSION })
    assert.equal(refused.code, 'title-required')
    const wrong = await deleteSession(ctx, config, { sessionId: SESSION, confirmTitle: 'Wrong Title', acknowledged: true })
    assert.equal(wrong.code, 'title-required')
    const deleted = await deleteSession(ctx, config, { sessionId: SESSION, confirmTitle: 'My Session', acknowledged: true })
    assert.equal(deleted.ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('batch delete is refused when title confirmation is enabled', async () => {
  const ctx = makeContext({})
  const result = await batchDelete(ctx, resolveConfig({ requireTitleConfirmation: true }), { sessionIds: [SESSION] })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'batch-title-required')
})

test('delete removes a live idle session after its turn is confirmed closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const ctx = makeContext({ stat: async () => snapshot(log), live: true, agentStatus: 'idle' })
    const deleted = await deleteSession(ctx, resolveConfig(undefined), { sessionId: SESSION })
    assert.equal(deleted.ok, true)
    await assert.rejects(stat(directory), /ENOENT/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('delete refuses a live session whose turn never settles within the wait', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const ctx = makeContext({ stat: async () => snapshot(log), live: true, agentStatus: 'running' })
    const deleted = await deleteSession(ctx, resolveConfig({ stopSettleMs: 50 }), { sessionId: SESSION, stopActivity: true })
    assert.equal(deleted.ok, false)
    assert.equal(deleted.code, 'still-running')
    // Nothing was removed: the directory is intact.
    assert.equal((await stat(directory)).isDirectory(), true)
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
    const deleted = await deleteSession(ctx, resolveConfig(undefined), { sessionId: SESSION, stopActivity: true })
    assert.equal(deleted.ok, true)
    assert.deepEqual(calls, ['workspace/session-stop'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a vanished directory is an idempotent success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { directory, log } = await sessionDir(root)
    const ctx = makeContext({ stat: async () => snapshot(log) })
    await rm(directory, { recursive: true, force: true })
    const deleted = await deleteSession(ctx, resolveConfig(undefined), { sessionId: SESSION })
    assert.equal(deleted.ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

/** One stored snapshot whose header id matches the session it describes. */
function snapFor(log, id) {
  const base = snapshot(log)
  return { ...base, header: { ...base.header, id } }
}

test('batchInspect lists a workspace sessions and refuses an unknown workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const { log } = await sessionDir(root)
    const workspace = { id: 'w1', path: '/tmp/demo', sessionIds: [SESSION], async detachSession() {} }
    const ctx = makeContext({ stat: async () => snapshot(log), workspaces: [workspace] })
    const listed = await batchInspect(ctx, resolveConfig(undefined), 'w1')
    assert.equal(listed.ok, true)
    assert.equal(listed.data.sessions.length, 1)
    assert.equal(listed.data.sessions[0].sessionId, SESSION)
    assert.equal(listed.data.sessions[0].eligible, true)
    const missing = await batchInspect(ctx, resolveConfig(undefined), 'nope')
    assert.equal(missing.code, 'not-found')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('batchDelete removes the selected sessions and keeps the rest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const second = 'session-22222222-2222-3333-4444-555555555555'
    const a = await sessionDir(root, SESSION)
    const b = await sessionDir(root, second)
    const logs = { [SESSION]: a.log, [second]: b.log }
    const workspace = { id: 'w1', path: '/tmp/demo', sessionIds: [SESSION, second], async detachSession() {} }
    const ctx = makeContext({
      workspaces: [workspace],
      stat: async (id) => snapFor(logs[id], id),
      list: async () => [SESSION, second].map(id => snapFor(logs[id], id)),
    })
    const result = await batchDelete(ctx, resolveConfig(undefined), { sessionIds: [SESSION] })
    assert.equal(result.ok, true)
    assert.equal(result.data.results.length, 1)
    assert.equal(result.data.results[0].ok, true)
    assert.equal(existsSync(a.directory), false)
    assert.equal(existsSync(b.directory), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('batchDelete deep cleanup reclaims exclusive attachments and keeps shared ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const hexA = 'a'.repeat(64)
    const hexB = 'b'.repeat(64)
    const hexC = 'c'.repeat(64)
    const s1 = SESSION
    const s2 = 'session-22222222-2222-3333-4444-555555555555'
    const s3 = 'session-33333333-2222-3333-4444-555555555555'
    const dirs = { [s1]: await sessionDir(root, s1), [s2]: await sessionDir(root, s2), [s3]: await sessionDir(root, s3) }
    const logs = {
      [s1]: [{ attachment: { attachmentId: `sha256:${hexA}` } }, { attachment: { attachmentId: `sha256:${hexC}` } }],
      [s2]: [{ attachment: { attachmentId: `sha256:${hexB}` } }],
      [s3]: [{ attachment: { attachmentId: `sha256:${hexC}` } }],
    }
    const attachRoot = join(root, 'attachments', 'v1')
    for (const hex of [hexA, hexB, hexC]) {
      const object = join(attachRoot, 'objects', hex.slice(0, 2), hex)
      await mkdir(join(attachRoot, 'objects', hex.slice(0, 2)), { recursive: true })
      await writeFile(object, 'bytes')
    }
    const workspace = { id: 'w1', path: '/tmp/demo', sessionIds: [s1, s2, s3], async detachSession() {} }
    const ctx = makeContext({
      workspaces: [workspace],
      logs,
      stat: async (id) => snapFor(dirs[id].log, id),
      // After deletion the listing reflects only the sessions still on disk.
      list: async () => [s1, s2, s3].map(id => snapFor(dirs[id].log, id)).filter(s => existsSync(s.location.path)),
      services: { attachments: { root: attachRoot } },
    })
    const result = await batchDelete(ctx, resolveConfig(undefined), { sessionIds: [s1, s2], deepAttachments: true })
    assert.equal(result.ok, true)
    assert.equal(result.data.results.filter(r => r.ok).length, 2)
    assert.equal(existsSync(dirs[s1].directory), false)
    assert.equal(existsSync(dirs[s2].directory), false)
    assert.equal(existsSync(dirs[s3].directory), true)
    // Exclusive attachments gone; the one still referenced by s3 kept.
    assert.equal(existsSync(join(attachRoot, 'objects', hexA.slice(0, 2), hexA)), false)
    assert.equal(existsSync(join(attachRoot, 'objects', hexB.slice(0, 2), hexB)), false)
    assert.equal(existsSync(join(attachRoot, 'objects', hexC.slice(0, 2), hexC)), true)
    assert.equal(result.data.attachments.removed, 2)
    assert.equal(result.data.attachments.kept, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('batchDelete deep cleanup fails closed when a remaining session is unreadable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sd-'))
  try {
    const hexA = 'a'.repeat(64)
    const hexC = 'c'.repeat(64)
    const s1 = SESSION
    const s3 = 'session-33333333-2222-3333-4444-555555555555'
    const dirs = { [s1]: await sessionDir(root, s1), [s3]: await sessionDir(root, s3) }
    const logs = {
      [s1]: [{ attachment: { attachmentId: `sha256:${hexA}` } }, { attachment: { attachmentId: `sha256:${hexC}` } }],
      [s3]: [{ attachment: { attachmentId: `sha256:${hexC}` } }],
    }
    const attachRoot = join(root, 'attachments', 'v1')
    for (const hex of [hexA, hexC]) {
      await mkdir(join(attachRoot, 'objects', hex.slice(0, 2)), { recursive: true })
      await writeFile(join(attachRoot, 'objects', hex.slice(0, 2), hex), 'bytes')
    }
    const workspace = { id: 'w1', path: '/tmp/demo', sessionIds: [s1, s3], async detachSession() {} }
    const ctx = makeContext({
      workspaces: [workspace],
      logs,
      failRead: [s3], // the remaining session cannot be read -> its refs are unknown
      stat: async (id) => snapFor(dirs[id].log, id),
      list: async () => [s1, s3].map(id => snapFor(dirs[id].log, id)).filter(s => existsSync(s.location.path)),
      services: { attachments: { root: attachRoot } },
    })
    const result = await batchDelete(ctx, resolveConfig(undefined), { sessionIds: [s1], deepAttachments: true })
    assert.equal(result.ok, true)
    // GC skipped: even the exclusive hexA is preserved because s3's refs are unknown.
    assert.equal(result.data.attachments.skipped, true)
    assert.equal(result.data.attachments.removed, 0)
    assert.equal(existsSync(join(attachRoot, 'objects', hexA.slice(0, 2), hexA)), true)
    assert.equal(existsSync(join(attachRoot, 'objects', hexC.slice(0, 2), hexC)), true)
    assert.ok(result.data.warnings.some(w => w.includes('skipped')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})