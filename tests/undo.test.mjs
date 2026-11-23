/**
 * Undo Host behaviour: config, rewind resolution, and conflict-aware targeted
 * revert via the shadow git repo. Verifies that only the undone turn's own
 * changes are reverted, files modified after the turn are skipped, and files
 * the turn never touched stay untouched (latest code preserved).
 */
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  clearQueue, dataRootOf, executeRewind, listCandidates, locateWorkspace, mountUndo, previewTurn, pruneShadowObjects, resolveRewind, resolveUndoConfig, revertTurn, runGit, snapshotTree, surfaceRangeBySeq, surfaceRewindRange, textOf, turnOfSeq,
} from '../undo-host.js'

const execFileAsync = promisify(execFile)
const git = (cwd, args) => execFileAsync('git', args, { cwd })

function makeSubprocess() {
  return {
    resolveExecutable: async () => 'git',
    spawn: ({ argv, cwd, env }) => {
      const child = spawn(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...env } })
      let out = ''
      let err = ''
      child.stdout.on('data', chunk => { out += chunk })
      child.stderr.on('data', chunk => { err += chunk })
      const done = new Promise((resolve, reject) => {
        child.on('close', code => resolve({ exitCode: code }))
        child.on('error', reject)
      })
      return {
        done,
        collected: {
          stdout: { readFrom: () => ({ text: out, lossy: false }) },
          stderr: { readFrom: () => ({ text: err }) },
        },
      }
    },
  }
}

const harness = async (dir, data) => {
  const ctx = { subprocess: makeSubprocess() }
  const config = resolveUndoConfig({ dataRoot: data })
  const signal = new AbortController().signal
  const workspace = await locateWorkspace(ctx, config, 'git', dir, signal)
  const snap = () => snapshotTree(ctx, config, 'git', workspace, signal)
  return { ctx, config, workspace, signal, snap }
}

test('resolveUndoConfig validates fields and defaults', () => {
  const base = resolveUndoConfig(undefined)
  assert.equal(base.snapshotEnabled, true)
  assert.equal(base.retentionDays, 7)
  assert.ok(base.snapshotExcludes.includes('node_modules/'))
  assert.throws(() => resolveUndoConfig({ retentionDays: -1 }), />= 0/u)
  assert.throws(() => resolveUndoConfig({ snapshotExcludes: 'x' }), /array of strings/u)
})

test('textOf joins text blocks only', () => {
  assert.equal(textOf([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb')
  assert.equal(textOf(undefined), '')
})

test('resolveRewind maps a message to its turn boundary and human prompt', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'first' }] } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, message: { id: 'm1' } } },
    { seq: 3, type: 'turn/end', data: { turn: 1 } },
    { seq: 4, type: 'turn/start', data: { turn: 2 } },
    { seq: 5, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'second' }] } },
    { seq: 6, type: 'assistant/message', data: { turn: 2, message: { id: 'm2' } } },
    { seq: 7, type: 'turn/end', data: { turn: 2 } },
  ]
  const second = resolveRewind(events, 'm2')
  assert.equal(second.turn, 2)
  assert.equal(second.boundary, 3)
  assert.equal(second.prompt, 'second')
  assert.equal(resolveRewind(events, 'm1').code, 'no-prior-turn')
  assert.equal(resolveRewind(events, 'missing').code, 'message-not-found')
})

test('revertTurn reverts the turn changes, skips later-modified files, leaves unrelated files untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'baseline')
    await writeFile(join(dir, 'keep.txt'), 'untouched')
    const { ctx, config, workspace, signal, snap } = await harness(dir, data)
    const start = await snap()
    // The turn edits a.txt and adds b.txt.
    await writeFile(join(dir, 'a.txt'), 'turn-edit')
    await writeFile(join(dir, 'b.txt'), 'new')
    const end = await snap()
    // After the turn: a.txt is modified again (superseded), keep.txt changed (unrelated).
    await writeFile(join(dir, 'a.txt'), 'later-edit')
    await writeFile(join(dir, 'keep.txt'), 'later-keep')
    const result = await revertTurn(ctx, config, 'git', workspace, start, end, signal)
    assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'later-edit') // superseded -> preserved
    assert.equal(existsSync(join(dir, 'b.txt')), false) // turn-added, unchanged -> removed
    assert.equal(await readFile(join(dir, 'keep.txt'), 'utf8'), 'later-keep') // unrelated -> untouched
    assert.deepEqual(result.reverted, ['b.txt'])
    assert.deepEqual(result.conflicts, ['a.txt'])
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('revertTurn restores an unsuperseded edit and recreates a file the turn deleted (non-git)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'baseline')
    await writeFile(join(dir, 'del.txt'), 'original')
    const { ctx, config, workspace, signal, snap } = await harness(dir, data)
    const start = await snap()
    await writeFile(join(dir, 'a.txt'), 'turn')
    await rm(join(dir, 'del.txt'))
    const end = await snap()
    const result = await revertTurn(ctx, config, 'git', workspace, start, end, signal)
    assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'baseline')
    assert.equal(await readFile(join(dir, 'del.txt'), 'utf8'), 'original')
    assert.equal(result.conflicts.length, 0)
    assert.equal(result.reverted.length, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('revertTurn works in a git workspace too and respects .gitignore', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'dsh-undo-repo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await git(repo, ['init', '-q'])
    await git(repo, ['config', 'user.email', 't@t'])
    await git(repo, ['config', 'user.name', 't'])
    await writeFile(join(repo, 'a.txt'), 'baseline')
    await writeFile(join(repo, '.gitignore'), 'ignored.txt\n')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-qm', 'base'])
    const { ctx, config, workspace, signal, snap } = await harness(repo, data)
    const start = await snap()
    await writeFile(join(repo, 'a.txt'), 'turn')
    await writeFile(join(repo, 'ignored.txt'), 'secret')
    const end = await snap()
    const result = await revertTurn(ctx, config, 'git', workspace, start, end, signal)
    assert.equal(await readFile(join(repo, 'a.txt'), 'utf8'), 'baseline')
    assert.equal(await readFile(join(repo, 'ignored.txt'), 'utf8'), 'secret') // ignored, never in diff
    assert.deepEqual(result.reverted, ['a.txt'])
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('locateWorkspace builds a shadow repo for a non-git directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-nogit-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    const ctx = { subprocess: makeSubprocess() }
    const config = resolveUndoConfig({ dataRoot: data })
    const workspace = await locateWorkspace(ctx, config, 'git', dir, new AbortController().signal)
    assert.notEqual(workspace, null)
    assert.equal(workspace.root, dir)
    assert.equal(workspace.env.GIT_WORK_TREE, dir)
    assert.ok(existsSync(join(workspace.gitDir, 'HEAD')))
    assert.ok(workspace.gitDir.startsWith(data))
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('clearQueue clears the live continuation inbox and refuses a non-live session', () => {
  let cleared = 0
  const ctx = { get: (name) => name === 'agents' ? { get: (id) => id === 'live' ? { inbox: { clear: () => { cleared++ } } } : undefined } : undefined }
  assert.deepEqual(clearQueue(ctx, { sessionId: 'live' }), { ok: true })
  assert.equal(cleared, 1)
  assert.equal(clearQueue(ctx, { sessionId: 'cold' }).ok, false)
  assert.equal(clearQueue(ctx, {}).code, 'bad-request')
})

test('surfaceRewindRange locates the tail range and protects the first node', () => {
  const session = { surface: { nodes: [1, 2, 5, 6] } }
  const ctx = { get: (name) => name === 'sessions' ? { get: (id) => id === 'live' ? session : undefined } : undefined }
  // boundary 3 (before turn 2): tail is nodes 5,6.
  const range = surfaceRewindRange(ctx, 'live', 3)
  assert.equal(range.startSeq, 5)
  assert.equal(range.endSeq, 6)
  assert.deepEqual(range.shadowed, [5, 6])
  assert.equal(range.session, session)
  // boundary 0 would remove node 0 (system prompt) -> refused.
  assert.equal(surfaceRewindRange(ctx, 'live', 0).code, 'no-prior-turn')
  // boundary past the last node -> nothing to rewind.
  assert.equal(surfaceRewindRange(ctx, 'live', 9).code, 'nothing-to-rewind')
  // cold session -> not live.
  assert.equal(surfaceRewindRange(ctx, 'cold', 3).code, 'not-live')
})

test('surfaceRangeBySeq shadows from the target node and guards the edges', () => {
  const session = { surface: { nodes: [1, 2, 5, 6] } }
  const range = surfaceRangeBySeq(session, 5)
  assert.equal(range.startSeq, 5)
  assert.equal(range.endSeq, 6)
  assert.deepEqual(range.shadowed, [5, 6])
  assert.equal(surfaceRangeBySeq(session, 1).code, 'no-prior-turn')
  assert.equal(surfaceRangeBySeq(session, 99).code, 'not-on-surface')
})

test('turnOfSeq finds the turn containing a seq', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 3, type: 'turn/end', data: { turn: 1 } },
    { seq: 4, type: 'turn/start', data: { turn: 2 } },
    { seq: 7, type: 'turn/end', data: { turn: 2 } },
  ]
  assert.equal(turnOfSeq(events, 1), 1)
  assert.equal(turnOfSeq(events, 5), 2)
  assert.equal(turnOfSeq(events, 0), 1)
})

test('executeRewind appends a surface-replace marker and returns its seq + prompt', async () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'p1' }] } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, message: { id: 'a1' } } },
    { seq: 3, type: 'turn/end', data: { turn: 1 } },
    { seq: 4, type: 'turn/start', data: { turn: 2 } },
    { seq: 5, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'p2' }] } },
    { seq: 6, type: 'assistant/message', data: { turn: 2, message: { id: 'a2' } } },
    { seq: 7, type: 'turn/end', data: { turn: 2 } },
  ]
  const appended = []
  const session = {
    id: 's1', header: {}, snapshotEvents: () => events, surface: { nodes: [1, 2, 5, 6] },
    append: (type, data, opts) => { appended.push({ type, data, opts }); return { seq: 8 } },
  }
  const agent = { session, status: 'idle', whenIdle: async () => {}, cancel: () => {} }
  const ctx = { logger: { info() {}, warn() {} }, get: () => undefined }
  const result = await executeRewind(ctx, resolveUndoConfig({}), async () => null, new Map(), agent, 5, 'chat', undefined)
  assert.equal(result.markerSeq, 8)
  assert.equal(result.prompt, 'p2')
  assert.equal(result.turn, 2)
  assert.equal(appended.length, 1)
  assert.deepEqual(appended[0].opts.surfaceOp, { op: 'replace', startSeq: 5, endSeq: 6 })
  assert.deepEqual(appended[0].opts.sourceEventSeqs, [5, 6])
  assert.equal(appended[0].data.content[0].text, '(empty message)')
})

test('executeRewind refuses a non-user target and a subagent session', async () => {
  const events = [{ seq: 1, type: 'assistant/message', data: { turn: 1, message: { id: 'a1' } } }]
  const session = { id: 's1', header: {}, snapshotEvents: () => events, surface: { nodes: [1] }, append: () => ({ seq: 2 }) }
  const agent = { session, status: 'idle', whenIdle: async () => {}, cancel: () => {} }
  const ctx = { logger: { info() {}, warn() {} }, get: () => undefined }
  const notUser = await executeRewind(ctx, resolveUndoConfig({}), async () => null, new Map(), agent, 1, 'chat', undefined)
  assert.equal(notUser.code, 'not-a-user-message')
  const child = { session: { ...session, header: { origin: 'subagent' } }, status: 'idle' }
  const sub = await executeRewind(ctx, resolveUndoConfig({}), async () => null, new Map(), child, 1, 'chat', undefined)
  assert.equal(sub.code, 'subagent')
})

test('previewTurn lists the turn file impact with actions and conflicts (dry-run)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'baseline')
    const { ctx, config, workspace, signal, snap } = await harness(dir, data)
    const start = await snap()
    await writeFile(join(dir, 'a.txt'), 'turn-edit')
    await writeFile(join(dir, 'b.txt'), 'new')
    const end = await snap()
    await writeFile(join(dir, 'a.txt'), 'later-edit') // superseded -> conflict
    const files = await previewTurn(ctx, config, 'git', workspace, start, end, signal)
    const byPath = Object.fromEntries(files.map(file => [file.path, file]))
    assert.equal(byPath['a.txt'].action, 'restore')
    assert.equal(byPath['a.txt'].conflict, true)
    assert.equal(byPath['b.txt'].action, 'remove')
    assert.equal(byPath['b.txt'].conflict, false)
    // dry-run: nothing on disk changed
    assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'later-edit')
    assert.equal(await readFile(join(dir, 'b.txt'), 'utf8'), 'new')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('listCandidates lists surface user messages newest first, excluding markers and withdrawn rows', () => {
  const events = [
    { seq: 1, type: 'user/message', time: 100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'first prompt' }] } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, message: { id: 'a1' } } },
    { seq: 5, type: 'user/message', time: 200, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'second prompt' }] } },
    { seq: 6, type: 'assistant/message', data: { turn: 2, message: { id: 'a2' } } },
    { seq: 8, type: 'user/message', time: 300, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '(empty message)' }] } },
    { seq: 9, type: 'user/message', time: 400, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'withdrawn' }] } },
  ]
  // surface excludes seq 9 (withdrawn); includes the marker seq 8 (filtered by content).
  const session = { surface: { nodes: [1, 2, 5, 6, 8] }, snapshotEvents: () => events }
  const ctx = { get: (name) => name === 'sessions' ? { get: (id) => id === 'live' ? session : undefined } : undefined }
  const result = listCandidates(ctx, { sessionId: 'live' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data.candidates.map(candidate => candidate.seq), [5, 1])
  assert.equal(result.data.candidates[0].text, 'second prompt')
  assert.equal(listCandidates(ctx, { sessionId: 'cold' }).data.candidates.length, 0)
})

test('revertTurn/previewTurn skip a nested git repo (gitlink) as a conflict, no directory rm', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'baseline')
    const nested = join(dir, 'nested')
    await mkdir(nested, { recursive: true })
    await git(nested, ['init', '-q'])
    await git(nested, ['config', 'user.email', 't@t'])
    await git(nested, ['config', 'user.name', 't'])
    await writeFile(join(nested, 'n.txt'), 'v1')
    await git(nested, ['add', '-A'])
    await git(nested, ['commit', '-qm', 'v1'])
    const { ctx, config, workspace, signal, snap } = await harness(dir, data)
    const start = await snap()
    await writeFile(join(dir, 'a.txt'), 'turn-edit')
    await writeFile(join(nested, 'n.txt'), 'v2')
    await git(nested, ['add', '-A'])
    await git(nested, ['commit', '-qm', 'v2'])
    const end = await snap()
    const result = await revertTurn(ctx, config, 'git', workspace, start, end, signal)
    assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'baseline')
    assert.ok(result.conflicts.includes('nested'))
    assert.equal(existsSync(nested), true)
    assert.equal(await readFile(join(nested, 'n.txt'), 'utf8'), 'v2')
    const preview = await previewTurn(ctx, config, 'git', workspace, start, end, signal)
    assert.equal(preview.find(file => file.path === 'nested').conflict, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('executeRewind forces conversation-only for a mid-turn steering target even with both', async () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'first prompt' }] } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, message: { id: 'a1' } } },
    { seq: 3, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'steering interjection' }] } },
    { seq: 4, type: 'assistant/message', data: { turn: 1, message: { id: 'a2' } } },
  ]
  const session = { id: 's1', header: {}, snapshotEvents: () => events, surface: { nodes: [1, 2, 3, 4] }, append: () => ({ seq: 5 }) }
  const agent = { session, status: 'idle', whenIdle: async () => {}, cancel: () => {} }
  const ctx = { logger: { info() {}, warn() {} }, get: () => undefined }
  // A whole-turn snapshot exists, but the steering target (seq 3) is not the turn's
  // first prompt (seq 1), so file restore must be skipped despite mode 'both'.
  const snapshots = new Map([['s1#1', { sessionId: 's1', turn: 1, startTree: 'x', endTree: 'y', cwd: '/tmp' }]])
  const result = await executeRewind(ctx, resolveUndoConfig({}), async () => 'git', snapshots, agent, 3, 'both', undefined)
  assert.equal(result.fileSnapshot, false)
  assert.deepEqual(result.reverted, [])
})

test('pruneShadowObjects keeps retained trees and prunes unretained ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'v1')
    const { ctx, config, workspace, signal, snap } = await harness(dir, data)
    const treeA = await snap()
    await writeFile(join(dir, 'a.txt'), 'v2')
    const treeB = await snap()
    await writeFile(join(dir, 'a.txt'), 'v3')
    const treeC = await snap() // not retained
    const snapshots = new Map([
      ['s#1', { sessionId: 's', turn: 1, startTree: treeA, endTree: treeB, cwd: dir, time: Date.now() }],
    ])
    await pruneShadowObjects(ctx, config, 'git', snapshots)
    const exists = async (tree) => (await runGit(ctx, config, 'git', ['cat-file', '-e', tree], { cwd: workspace.root, env: workspace.env, signal })).exitCode === 0
    assert.equal(await exists(treeA), true)
    assert.equal(await exists(treeB), true)
    assert.equal(await exists(treeC), false)
    // a retained tree is still checkout-able after pruning
    const co = await runGit(ctx, config, 'git', ['checkout', treeA, '--', 'a.txt'], { cwd: workspace.root, env: { ...workspace.env, GIT_INDEX_FILE: join(workspace.objects, 'co-index') }, signal })
    assert.equal(co.exitCode, 0)
    assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'v1')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

/** Mount mountUndo against a minimal Host double; captures event listeners and routes. */
function mountHarness(dir, data, subprocessImpl) {
  const listeners = new Map()
  const routes = new Map()
  const ctx = {
    subprocess: subprocessImpl ?? makeSubprocess(),
    logger: { info() {}, warn() {} },
    effect: (fn) => { fn(); return () => {} },
    on: (name, fn) => { listeners.set(name, fn); return () => {} },
    inject: (_names, cb) => { cb({ effect: (fn) => fn(), commands: { register: () => () => {} } }); return () => {} },
    webServer: { register: (route) => { routes.set(route.path, route); return () => {} } },
    get: () => undefined,
  }
  const config = resolveUndoConfig({ dataRoot: data })
  const handle = mountUndo(ctx, config)
  return { ctx, config, handle, listeners, routes }
}

test('dataRootOf honors DSH_HOME like the harness home resolution', () => {
  const saved = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = join(tmpdir(), 'dsh-home-env')
    assert.equal(dataRootOf({ dataRoot: '' }), join(process.env.DSH_HOME, 'session-undo'))
    // A blank override is treated as unset, never the current directory.
    process.env.DSH_HOME = '   '
    assert.equal(dataRootOf({ dataRoot: '' }), join(homedir(), '.dsh', 'session-undo'))
    delete process.env.DSH_HOME
    assert.equal(dataRootOf({ dataRoot: '' }), join(homedir(), '.dsh', 'session-undo'))
    // An explicit dataRoot keeps highest precedence.
    process.env.DSH_HOME = join(tmpdir(), 'dsh-home-env')
    assert.equal(dataRootOf({ dataRoot: join(tmpdir(), 'explicit') }), join(tmpdir(), 'explicit'))
  } finally {
    if (saved === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = saved
  }
})

test('tools/pre-execute gate observes exec.signal and always calls next()', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    // A subprocess whose git never settles: the start snapshot stays pending.
    const hang = {
      resolveExecutable: async () => 'git',
      spawn: () => ({
        done: new Promise(() => {}),
        collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) }, stderr: { readFrom: () => ({ text: '' }) } },
      }),
    }
    const { listeners } = mountHarness(dir, data, hang)
    const gate = listeners.get('tools/pre-execute')
    listeners.get('session/event')({ id: 's1', header: { cwd: dir } }, { type: 'turn/start', data: { turn: 1 } })
    let nextCalls = 0
    const next = async () => { nextCalls += 1 }
    // An abort while the snapshot hangs must release the gate promptly.
    const controller = new AbortController()
    const settled = gate({ agent: { session: { id: 's1' } }, signal: controller.signal }, next)
    controller.abort()
    let timer
    await Promise.race([
      settled,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('gate did not observe exec.signal abort')), 2000) }),
    ])
    clearTimeout(timer)
    assert.equal(nextCalls, 1)
    // An already-aborted signal does not wait at all.
    const aborted = new AbortController()
    aborted.abort()
    await gate({ agent: { session: { id: 's1' } }, signal: aborted.signal }, next)
    assert.equal(nextCalls, 2)
    // No pending snapshot for an unknown session: next() immediately.
    await gate({ agent: { session: { id: 'other' } } }, next)
    assert.equal(nextCalls, 3)
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('a turn recorded concurrently with mount-time shadow GC keeps its tree (serial queue)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'a.txt'), 'v1')
    // Pre-create the shadow repo and one retained record so mount-time GC has
    // a repo to prune; the concurrent recorder writes a second, new tree.
    const pre = await harness(dir, data)
    const treeA = await pre.snap()
    await writeFile(join(data, 'snapshots.json'), JSON.stringify([
      { sessionId: 's1', turn: 1, startTree: treeA, endTree: treeA, cwd: dir, time: Date.now() },
    ]))
    // Change the work tree so the concurrent recorder writes a DIFFERENT tree
    // (identical content would hash to the retained treeA and mask the race).
    await writeFile(join(dir, 'a.txt'), 'v2')
    // Instrument git: prune's `gc` waits until the concurrent recorder's
    // write-tree has settled, forcing the dangerous interleaving (retained-set
    // copied before the new tree exists, gc running after it is written).
    let gcSettled = false
    let releaseWriteTree
    const writeTreeDone = new Promise((resolve) => { releaseWriteTree = resolve })
    const base = makeSubprocess()
    const instrumented = {
      resolveExecutable: base.resolveExecutable,
      spawn: (opts) => {
        if (opts.argv.includes('gc')) {
          // Delay the ACTUAL gc spawn until the concurrent write-tree has
          // settled: gc must run after the new tree exists on disk, or it
          // prunes nothing and the dangerous interleaving is not exercised.
          let real
          const done = (async () => {
            await Promise.race([writeTreeDone, new Promise((resolve) => setTimeout(resolve, 3000))])
            real = base.spawn(opts)
            const outcome = await real.done
            gcSettled = true
            return outcome
          })()
          return {
            done,
            collected: {
              stdout: { readFrom: (index) => real?.collected.stdout.readFrom(index) ?? { text: '', lossy: false } },
              stderr: { readFrom: (index) => real?.collected.stderr.readFrom(index) ?? { text: '' } },
            },
          }
        }
        const handle = base.spawn(opts)
        if (opts.argv.includes('write-tree')) {
          handle.done.then(releaseWriteTree, releaseWriteTree)
        }
        return handle
      },
    }
    const { listeners } = mountHarness(dir, data, instrumented)
    // Fire the recorder synchronously so its queue entry precedes the
    // mount-time GC enqueue (which waits for the store load first).
    listeners.get('session/event')({ id: 's2', header: { cwd: dir } }, { type: 'turn/start', data: { turn: 1 } })
    const deadline = Date.now() + 15000
    let store = []
    while (Date.now() < deadline) {
      store = JSON.parse(await readFile(join(data, 'snapshots.json'), 'utf8').catch(() => '[]'))
      if (gcSettled && store.some(record => record.sessionId === 's2')) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const record = store.find(entry => entry.sessionId === 's2')
    assert.ok(record, 'the concurrent record persisted')
    assert.ok(gcSettled, 'mount-time GC ran')
    const exists = async (tree) => (await runGit(pre.ctx, pre.config, 'git', ['cat-file', '-e', tree], { cwd: dir, env: pre.workspace.env, signal: pre.signal })).exitCode === 0
    assert.equal(await exists(record.startTree), true, 'concurrently recorded tree must survive GC')
    assert.equal(await exists(treeA), true, 'retained tree survives GC')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})