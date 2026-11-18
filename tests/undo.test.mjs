/**
 * Undo Host behaviour: config, rewind resolution, and conflict-aware targeted
 * revert via the shadow git repo. Verifies that only the undone turn's own
 * changes are reverted, files modified after the turn are skipped, and files
 * the turn never touched stay untouched (latest code preserved).
 */
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  locateWorkspace, resolveRewind, resolveUndoConfig, revertTurn, snapshotTree, textOf,
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