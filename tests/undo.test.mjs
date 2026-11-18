/**
 * Host-half behaviour: config, rewind resolution, and â€?against a real temporary
 * git repository â€?snapshot/restore safety (modified files reverted, added files
 * removed, ignored files untouched).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

import {
  locateWorkspace, resolveUndoConfig, resolveRewind, restoreTree, runGit, snapshotTree, textOf,
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
  assert.equal(resolveUndoConfig({ retentionDays: 14 }).retentionDays, 14)
  assert.throws(() => resolveUndoConfig({ retentionDays: -1 }), />= 0/u)
  assert.throws(() => resolveUndoConfig({ snapshotEnabled: 'yes' }), /boolean/u)
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
  assert.equal(second.boundary, 3) // fork inherits through turn 1's end
  assert.equal(second.prompt, 'second')
  const first = resolveRewind(events, 'm1')
  assert.equal(first.code, 'no-prior-turn') // nothing before turn 1
  assert.equal(resolveRewind(events, 'missing').code, 'message-not-found')
})

test('snapshot and restore revert modified files, remove added files, keep ignored files', async () => {
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

    const ctx = { subprocess: makeSubprocess() }
    const config = resolveUndoConfig({ dataRoot: data })
    const signal = new AbortController().signal
    const workspace = await locateWorkspace(ctx, config, 'git', repo, signal)
    assert.notEqual(workspace, null)

    // Turn-start snapshot of the baseline state.
    const tree = await snapshotTree(ctx, config, 'git', workspace, signal)
    assert.match(tree, /^[0-9a-f]{40,64}$/u)

    // The turn modifies a tracked file and adds a tracked-able file plus an ignored file.
    await writeFile(join(repo, 'a.txt'), 'changed')
    await writeFile(join(repo, 'b.txt'), 'new')
    await writeFile(join(repo, 'ignored.txt'), 'secret')

    const result = await restoreTree(ctx, config, 'git', workspace, tree, signal)
    assert.equal(await readFile(join(repo, 'a.txt'), 'utf8'), 'baseline')
    assert.equal(existsSync(join(repo, 'b.txt')), false)
    assert.equal(await readFile(join(repo, 'ignored.txt'), 'utf8'), 'secret')
    assert.equal(result.removed, 1) // b.txt removed; ignored.txt excluded
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('restore recreates a file the turn deleted', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'dsh-undo-repo-'))
  const data = await mkdtemp(join(tmpdir(), 'dsh-undo-data-'))
  try {
    await git(repo, ['init', '-q'])
    await git(repo, ['config', 'user.email', 't@t'])
    await git(repo, ['config', 'user.name', 't'])
    await writeFile(join(repo, 'keep.txt'), 'original')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-qm', 'base'])
    const ctx = { subprocess: makeSubprocess() }
    const config = resolveUndoConfig({ dataRoot: data })
    const signal = new AbortController().signal
    const workspace = await locateWorkspace(ctx, config, 'git', repo, signal)
    const tree = await snapshotTree(ctx, config, 'git', workspace, signal)
    await rm(join(repo, 'keep.txt'))
    await restoreTree(ctx, config, 'git', workspace, tree, signal)
    assert.equal(await readFile(join(repo, 'keep.txt'), 'utf8'), 'original')
  } finally {
    await rm(repo, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
})

test('locateWorkspace returns null outside a repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-undo-nogit-'))
  try {
    const ctx = { subprocess: makeSubprocess() }
    const config = resolveUndoConfig({ dataRoot: dir })
    const workspace = await locateWorkspace(ctx, config, 'git', dir, new AbortController().signal)
    assert.equal(workspace, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})