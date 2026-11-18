/**
 * Undo Host behaviour: config, rewind resolution, and shadow-git snapshot/restore
 * safety for BOTH git and non-git workspaces (modified files reverted, added files
 * removed, ignored files untouched, deleted files recreated).
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
  locateWorkspace, resolveRewind, resolveUndoConfig, restoreTree, snapshotTree, textOf,
} from '../undo-host.js'

const execFileAsync = promisify(execFile)
const git = (cwd, args) => execFileAsync('git', args, { cwd })

/** A subprocess capability double that runs real git and exposes the plugin's handle shape. */
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

test('resolveUndoConfig validates fields and defaults', () => {
  const base = resolveUndoConfig(undefined)
  assert.equal(base.snapshotEnabled, true)
  assert.equal(base.retentionDays, 7)
  assert.ok(base.snapshotExcludes.includes('node_modules/'))
  assert.equal(resolveUndoConfig({ retentionDays: 14 }).retentionDays, 14)
  assert.throws(() => resolveUndoConfig({ retentionDays: -1 }), />= 0/u)
  assert.throws(() => resolveUndoConfig({ snapshotEnabled: 'yes' }), /boolean/u)
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

/** Run the snapshot/modify/restore safety scenario against a workspace directory. */
async function exerciseRestore(dir, data) {
  const ctx = { subprocess: makeSubprocess() }
  const config = resolveUndoConfig({ dataRoot: data })
  const signal = new AbortController().signal
  const workspace = await locateWorkspace(ctx, config, 'git', dir, signal)
  assert.notEqual(workspace, null)
  const tree = await snapshotTree(ctx, config, 'git', workspace, signal)
  assert.match(tree, /^[0-9a-f]{40,64}$/u)
  await writeFile(join(dir, 'a.txt'), 'changed')
  await writeFile(join(dir, 'b.txt'), 'new')
  await writeFile(join(dir, 'ignored.txt'), 'secret')
  const result = await restoreTree(ctx, config, 'git', workspace, tree, signal)
  assert.equal(await readFile(join(dir, 'a.txt'), 'utf8'), 'baseline')
  assert.equal(existsSync(join(dir, 'b.txt')), false)
  assert.equal(await readFile(join(dir, 'ignored.txt'), 'utf8'), 'secret')
  assert.equal(result.removed, 1)
}

test('git workspace: revert modified, remove added, keep ignored', async () => {
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
    await exerciseRestore(repo, data)
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('non-git workspace: shadow repo enables the same revert safety', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-nogit-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    // No git init: an ordinary directory.
    await writeFile(join(dir, 'a.txt'), 'baseline')
    await writeFile(join(dir, '.gitignore'), 'ignored.txt\n')
    await exerciseRestore(dir, data)
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('restore recreates a file the turn deleted (non-git)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-nogit-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await writeFile(join(dir, 'keep.txt'), 'original')
    const ctx = { subprocess: makeSubprocess() }
    const config = resolveUndoConfig({ dataRoot: data })
    const signal = new AbortController().signal
    const workspace = await locateWorkspace(ctx, config, 'git', dir, signal)
    const tree = await snapshotTree(ctx, config, 'git', workspace, signal)
    await rm(join(dir, 'keep.txt'))
    await restoreTree(ctx, config, 'git', workspace, tree, signal)
    assert.equal(await readFile(join(dir, 'keep.txt'), 'utf8'), 'original')
  } finally {
    await rm(dir, { recursive: true, force: true })
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