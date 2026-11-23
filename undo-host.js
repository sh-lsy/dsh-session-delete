/**
 * Turn-undo Host module of `@sh-lsy/dsh-session-delete`.
 *
 * Records a persistent git working-tree snapshot at the start of every
 * top-level turn, and serves owner-only undo routes that revert the working
 * tree to a chosen turn's start snapshot and return the fork boundary plus the
 * undone prompt. The Web half forks a continuation session through the official
 * client fork API and restores the prompt to the composer.
 *
 * File revert is conservative: `checkout-index -a -f` restores every file the
 * snapshot holds, and only non-ignored files added after the snapshot are
 * removed — ignored files (node_modules, build output) are never touched.
 *
 * @module @sh-lsy/dsh-session-delete/undo-host
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SNAPSHOTS_PATH = '/session-undo/snapshots'
const PURGE_PATH = '/session-undo/purge'
const CLEAR_QUEUE_PATH = '/session-undo/clear-queue'
const PREVIEW_PATH = '/session-undo/preview'
const CANDIDATES_PATH = '/session-undo/candidates'
const DAY_MS = 86_400_000
const STDERR_TAIL_BYTES = 16 * 1024
const TERMINATE_GRACE_MS = 2_000

/** Heavy regenerable directories kept out of snapshots by default (shadow info/exclude). */
const DEFAULT_EXCLUDES = ['node_modules/', '.git/', '__pycache__/', '.venv/', 'venv/', '.next/', '.cache/', '.turbo/']

/** Undo defaults merged into the plugin row config. */
export function undoDefaults() {
  return {
    snapshotEnabled: true,
    retentionDays: 7,
    timeoutMs: 30_000,
    outputMaxBytes: 8 * 1024 * 1024,
    dataRoot: '',
    snapshotExcludes: [...DEFAULT_EXCLUDES],
  }
}

/** Validate the undo slice of the row config. */
export function resolveUndoConfig(raw) {
  const base = undoDefaults()
  if (raw === undefined || raw === null) return base
  const num = (key, min) => {
    const value = raw[key] ?? base[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
      throw new TypeError(`session-delete: config.${key} must be a number >= ${min}`)
    }
    return value
  }
  const snapshotEnabled = raw.snapshotEnabled ?? base.snapshotEnabled
  if (typeof snapshotEnabled !== 'boolean') throw new TypeError('session-delete: config.snapshotEnabled must be a boolean')
  const dataRoot = raw.dataRoot ?? base.dataRoot
  if (typeof dataRoot !== 'string') throw new TypeError('session-delete: config.dataRoot must be a string')
  const snapshotExcludes = raw.snapshotExcludes ?? base.snapshotExcludes
  if (!Array.isArray(snapshotExcludes) || snapshotExcludes.some(item => typeof item !== 'string')) {
    throw new TypeError('session-delete: config.snapshotExcludes must be an array of strings')
  }
  return {
    snapshotEnabled,
    retentionDays: num('retentionDays', 0),
    timeoutMs: num('timeoutMs', 1),
    outputMaxBytes: num('outputMaxBytes', 1),
    dataRoot,
    snapshotExcludes: [...snapshotExcludes],
  }
}

/** Resolve the persistent data root for snapshot metadata and object stores. */
export function dataRootOf(config) {
  return config.dataRoot !== '' ? config.dataRoot : join(homedir(), '.dsh', 'session-undo')
}

function storeName(cwd) {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16)
}

/** Run one git command to completion with bounded output and a scrubbed env. */
export async function runGit(ctx, config, executable, args, options) {
  const timeout = AbortSignal.timeout(config.timeoutMs)
  const signal = AbortSignal.any([options.signal, timeout])
  const handle = ctx.subprocess.spawn({
    argv: [executable, ...args],
    cwd: options.cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: options.maxBytes ?? config.outputMaxBytes },
      stderr: { maxBytes: STDERR_TAIL_BYTES },
    },
    graceMs: TERMINATE_GRACE_MS,
    signal,
    env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', ...options.env },
  })
  const outcome = await handle.done
  if (signal.aborted) throw new Error(`git ${args.join(' ')} timed out or was aborted`)
  const stdout = handle.collected.stdout?.readFrom(0) ?? { text: '', lossy: false }
  const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
  return { exitCode: outcome.exitCode, stdout: stdout.text, stderr }
}

/**
 * Address a persistent shadow git repository for the workspace (opencode-style).
 *
 * The shadow repo lives under the plugin data root, never in the workspace, so
 * snapshots work for git and non-git workspaces alike and never touch the user's
 * own repository. Heavy regenerable directories are excluded via info/exclude.
 * @returns workspace facts whose env points git at the shadow dir + work tree.
 */
export async function locateWorkspace(ctx, config, executable, cwd, signal) {
  const gitDir = join(dataRootOf(config), 'snapshot', storeName(cwd))
  await mkdir(gitDir, { recursive: true })
  if (!existsSync(join(gitDir, 'HEAD'))) {
    const init = await runGit(ctx, config, executable, ['init', '--bare', '-q'], { cwd: gitDir, signal })
    if (init.exitCode !== 0) throw new Error(`git init shadow failed: ${init.stderr.trim()}`)
    await runGit(ctx, config, executable, ['config', 'core.bare', 'false'], { cwd: gitDir, env: { GIT_DIR: gitDir }, signal })
  }
  // Rewrite excludes on every locate so a config change takes effect without
  // re-initializing the shadow repo.
  await mkdir(join(gitDir, 'info'), { recursive: true })
  await writeFile(join(gitDir, 'info', 'exclude'), `${config.snapshotExcludes.join('\n')}\n`)
  const env = { GIT_DIR: gitDir, GIT_WORK_TREE: cwd }
  return { root: cwd, gitDir, objects: join(gitDir, 'objects'), env, excludes: [] }
}

/** Write the complete work tree (untracked and modified, not ignored) as a tree object. */
export async function snapshotTree(ctx, config, executable, workspace, signal) {
  const scratch = await mkdtemp(join(workspace.objects, 'index-'))
  try {
    const index = join(scratch, 'index')
    await copyFile(join(workspace.gitDir, 'index'), index).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    const env = { ...workspace.env, GIT_INDEX_FILE: index }
    const pathspec = workspace.excludes.length === 0 ? [] : ['--', '.', ...workspace.excludes.map(path => `:(exclude)${path}`)]
    const added = await runGit(ctx, config, executable, ['add', '--all', '--ignore-errors', ...pathspec], { cwd: workspace.root, env, signal })
    if (added.exitCode !== 0 && added.exitCode !== 1) throw new Error(`git add failed: ${added.stderr.trim()}`)
    const written = await runGit(ctx, config, executable, ['write-tree'], { cwd: workspace.root, env, signal })
    if (written.exitCode !== 0) throw new Error(`git write-tree failed: ${written.stderr.trim()}`)
    return written.stdout.trim()
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** A tree entry at a path: {type:'blob'|'commit'|'tree', oid}, or null when absent. */
async function treeEntry(ctx, config, executable, workspace, tree, path, signal) {
  const result = await runGit(ctx, config, executable, ['ls-tree', tree, '--', path], { cwd: workspace.root, env: workspace.env, signal })
  if (result.exitCode !== 0) return null
  const match = /^\d+ (blob|commit|tree) ([0-9a-f]+)\t/.exec(result.stdout.split('\n')[0] ?? '')
  return match ? { type: match[1], oid: match[2] } : null
}

/** Current work-tree blob oid of a path, or null when the file is absent. */
async function currentOid(ctx, config, executable, workspace, path, signal) {
  const result = await runGit(ctx, config, executable, ['hash-object', '--', path], { cwd: workspace.root, env: workspace.env, signal })
  if (result.exitCode !== 0) return null
  return result.stdout.trim() || null
}

/**
 * Classify the turn's changed paths into a revert plan and conflicts, writing
 * nothing. A non-blob tree entry (gitlink/submodule `commit`, nested `tree`) is a
 * conflict — it cannot be safely restored/removed file-by-file (a directory rm
 * would throw EISDIR). A file modified after the turn is also a conflict.
 * @returns {plan: [{path, startOid}], conflicts: [path]}.
 */
async function classifyTurn(ctx, config, executable, workspace, startTree, endTree, signal) {
  const diff = await runGit(ctx, config, executable, ['diff', '--name-only', '-z', startTree, endTree], { cwd: workspace.root, env: workspace.env, signal })
  if (diff.exitCode !== 0) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
  const paths = diff.stdout.split('\0').filter(Boolean)
  const plan = []
  const conflicts = []
  for (const path of paths) {
    const endEntry = await treeEntry(ctx, config, executable, workspace, endTree, path, signal)
    const startEntry = await treeEntry(ctx, config, executable, workspace, startTree, path, signal)
    if ((endEntry !== null && endEntry.type !== 'blob') || (startEntry !== null && startEntry.type !== 'blob')) {
      conflicts.push(path)
      continue
    }
    const endOid = endEntry?.oid ?? null
    const startOid = startEntry?.oid ?? null
    const curOid = await currentOid(ctx, config, executable, workspace, path, signal)
    const unchangedSinceTurn = endOid !== null ? curOid === endOid : curOid === null
    if (!unchangedSinceTurn) {
      conflicts.push(path)
      continue
    }
    plan.push({ path, startOid })
  }
  return { plan, conflicts }
}

/**
 * Conflict-aware revert of one turn's own file changes.
 *
 * The whole plan is classified before anything is written, so a gitlink or a
 * later-modified file is skipped up front and never triggers a mid-revert failure.
 * Only files the turn changed and whose current content still equals the turn's
 * end state are reverted; everything else is left untouched.
 * @returns reverted paths and skipped conflict paths.
 */
export async function revertTurn(ctx, config, executable, workspace, startTree, endTree, signal) {
  const { plan, conflicts } = await classifyTurn(ctx, config, executable, workspace, startTree, endTree, signal)
  const scratch = await mkdtemp(join(workspace.objects, 'revert-'))
  const reverted = []
  try {
    const env = { ...workspace.env, GIT_INDEX_FILE: join(scratch, 'index') }
    for (const { path, startOid } of plan) {
      if (startOid !== null) {
        const checkout = await runGit(ctx, config, executable, ['checkout', startTree, '--', path], { cwd: workspace.root, env, signal })
        if (checkout.exitCode !== 0) throw new Error(`git checkout ${path} failed: ${checkout.stderr.trim()}`)
      } else {
        await rm(join(workspace.root, path), { force: true })
      }
      reverted.push(path)
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  return { reverted, conflicts }
}

/**
 * Dry-run file impact of rewinding one turn: the files it changed, the revert
 * action (restore content / remove a turn-added file), and whether each is a
 * conflict (a non-blob gitlink/nested tree, or modified after the turn). Touches
 * nothing.
 * @returns one {path, action, conflict} entry per changed file.
 */
export async function previewTurn(ctx, config, executable, workspace, startTree, endTree, signal) {
  const diff = await runGit(ctx, config, executable, ['diff', '--name-only', '-z', startTree, endTree], { cwd: workspace.root, env: workspace.env, signal })
  if (diff.exitCode !== 0) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
  const paths = diff.stdout.split('\0').filter(Boolean)
  const files = []
  for (const path of paths) {
    const endEntry = await treeEntry(ctx, config, executable, workspace, endTree, path, signal)
    const startEntry = await treeEntry(ctx, config, executable, workspace, startTree, path, signal)
    const nonBlob = (endEntry !== null && endEntry.type !== 'blob') || (startEntry !== null && startEntry.type !== 'blob')
    const endOid = endEntry?.type === 'blob' ? endEntry.oid : null
    const startOid = startEntry?.type === 'blob' ? startEntry.oid : null
    const curOid = nonBlob ? null : await currentOid(ctx, config, executable, workspace, path, signal)
    const unchangedSinceTurn = endOid !== null ? curOid === endOid : curOid === null
    files.push({ path, action: startOid !== null ? 'restore' : 'remove', conflict: nonBlob || !unchangedSinceTurn })
  }
  return files
}

/** Join the text blocks of a message content array. */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n')
}

/** Recursively freeze a plain value so a constructed message is immutable. */
function deepFreeze(value) {
  Object.freeze(value)
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child)
  }
  return value
}

/** Resolve the turn, fork boundary, and undone prompt for a message id. */
export function resolveRewind(events, messageId) {
  let turn
  for (const event of events) {
    if (event.type === 'assistant/message' && event.data?.message?.id === messageId) {
      turn = event.data.turn
      break
    }
  }
  if (turn === undefined) return { code: 'message-not-found' }
  let startSeq
  for (const event of events) {
    if (event.type === 'turn/start' && event.data?.turn === turn) {
      startSeq = event.seq
      break
    }
  }
  if (startSeq === undefined) return { code: 'turn-not-found' }
  if (startSeq === 0) return { code: 'no-prior-turn' }
  let prompt = ''
  for (const event of events) {
    if (event.seq > startSeq && event.type === 'user/message' && event.data?.source?.kind === 'user') {
      prompt = textOf(event.data.content)
      break
    }
  }
  return { turn, boundary: startSeq - 1, prompt }
}

/**
 * Mount the undo recorder and owner-only routes. Called by the plugin apply
 * with the already-resolved combined config.
 * @param ctx - Host context.
 * @param config - resolved plugin config (includes the undo slice).
 */
export function mountUndo(ctx, config) {
  const root = dataRootOf(config)
  const storeFile = join(root, 'snapshots.json')
  const snapshots = new Map()
  let writeTail = Promise.resolve()

  const load = async () => {
    await mkdir(root, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(storeFile, 'utf8'))
      if (Array.isArray(parsed)) for (const record of parsed) snapshots.set(`${record.sessionId}#${record.turn}`, record)
    } catch {
      // A missing or unreadable store starts empty.
    }
  }
  // Start loading immediately; recorders await this so a startup turn cannot
  // overwrite records that have not been read yet.
  const loadPromise = load()
  const persist = () => {
    writeTail = writeTail.then(async () => {
      await loadPromise
      // Atomic replace: a crash mid-write leaves the previous store intact.
      const tmp = `${storeFile}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify([...snapshots.values()]))
      await rename(tmp, storeFile)
    }).catch(error => ctx.logger.warn(`session-undo: persist failed: ${String(error)}`))
    return writeTail
  }

  let executablePromise
  const executable = () => {
    executablePromise ??= ctx.subprocess.resolveExecutable('git', undefined, new AbortController().signal).catch(() => null)
    return executablePromise
  }

  const pending = new Map()
  const snapshotOf = async (cwd) => {
    const exe = await executable()
    if (exe === null) return null
    const workspace = await locateWorkspace(ctx, config, exe, cwd, new AbortController().signal)
    if (workspace === null) return null
    return snapshotTree(ctx, config, exe, workspace, new AbortController().signal)
  }
  const recordStart = async (sessionId, turn, cwd) => {
    const treeId = await snapshotOf(cwd)
    if (treeId === null) return
    const key = `${sessionId}#${turn}`
    const existing = snapshots.get(key)
    snapshots.set(key, { sessionId, turn, startTree: treeId, endTree: existing?.endTree ?? null, cwd, time: Date.now() })
    await persist()
  }
  const recordEnd = async (sessionId, turn, cwd) => {
    const treeId = await snapshotOf(cwd)
    if (treeId === null) return
    const key = `${sessionId}#${turn}`
    const existing = snapshots.get(key)
    snapshots.set(key, { sessionId, turn, startTree: existing?.startTree ?? treeId, endTree: treeId, cwd, time: Date.now() })
    await persist()
  }

  ctx.effect(() => async () => { await writeTail })

  ctx.on('session/event', (session, event) => {
    if (!config.snapshotEnabled) return
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return
    const { cwd, origin, delegationDepth } = session.header
    if (origin === 'subagent' || (delegationDepth ?? 0) > 0 || cwd === undefined) return
    const record = event.type === 'turn/start' ? recordStart : recordEnd
    const promise = record(session.id, event.data.turn, cwd)
      .catch(error => ctx.logger.warn(`session-undo: snapshot failed for ${session.id} turn ${event.data.turn}: ${String(error)}`))
    if (event.type === 'turn/start') pending.set(session.id, promise)
  })
  ctx.on('tools/pre-execute', async (exec, next) => {
    const sessionId = exec.agent?.session?.id
    const promise = sessionId === undefined ? undefined : pending.get(sessionId)
    if (promise !== undefined) await promise
    return next()
  })

  const route = (path, run) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path, auth: 'required',
    handler: (req, res, peer) => serveUndo(ctx, req, res, peer, run),
  }), `session-undo: POST ${path}`)

  route(SNAPSHOTS_PATH, body => listSnapshots(snapshots, body))
  route(PURGE_PATH, () => purge(ctx, config, snapshots, persist))
  route(CLEAR_QUEUE_PATH, body => clearQueue(ctx, body))
  route(PREVIEW_PATH, body => previewRewind(ctx, config, executable, snapshots, body))
  route(CANDIDATES_PATH, body => listCandidates(ctx, body))

  // The /rewind engine command: the client drives it with `@<seq> <mode>`; the
  // command node durably records the marker seq (outcome.sourceEventSeq) so the
  // client can hide the withdrawn transcript span across reloads.
  const rewindHandler = async (invocation) => {
    const raw = (invocation.rawInput ?? '').trim()
    const match = /^@(\d+)(?:\s+(chat|both))?$/.exec(raw)
    if (match === null) return { kind: 'error', text: 'usage: /rewind @<seq> [chat|both]' }
    const targetSeq = Number(match[1])
    const mode = match[2] ?? 'both'
    const agent = invocation.agent
    if (agent === undefined) return { kind: 'error', text: 'no active session' }
    try {
      const result = await executeRewind(ctx, config, executable, snapshots, agent, targetSeq, mode, invocation.signal)
      if (result.code !== undefined) return { kind: 'error', text: result.message ?? result.code }
      const fileSummary = result.fileSnapshot
        ? ` Reverted ${result.reverted.length} file(s), skipped ${result.conflicts.length} conflict(s).`
        : ' Conversation only.'
      return { kind: 'success', text: `Rewound to message @${targetSeq}.${fileSummary}`, sourceEventSeq: result.markerSeq }
    } catch (error) {
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }
  ctx.inject(['commands'], (scope) => {
    scope.effect(() => scope.commands.register({
      name: 'rewind',
      description: 'Rewind the conversation to an earlier message',
      handler: rewindHandler,
    }), 'session-undo: /rewind command')
  })

  // Drop a deleted session's snapshot records so the store does not grow forever.
  const forgetSession = async (sessionId) => {
    await loadPromise
    let changed = false
    for (const [key, record] of snapshots) {
      if (record.sessionId === sessionId) {
        snapshots.delete(key)
        changed = true
      }
    }
    if (changed) await persist()
  }
  // Enforce the retention window once at mount (the owner purge route still works).
  void loadPromise.then(() => purge(ctx, config, snapshots, persist)).catch(() => {})
  return { forgetSession }
}

/**
 * Clear a forked continuation's inherited pending inbox.
 *
 * A fork cut before a turn inherits that turn's queue-insert splice but not its
 * claim, leaving the undone prompt pending in the child's queue. Clearing it
 * lets the prompt be restored as a composer draft instead of auto-sending.
 * @param ctx - Host context.
 * @param body - `{ sessionId }` of the live continuation.
 * @returns ok, or a refusal when the agent is not live.
 */
export function clearQueue(ctx, body) {
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string') return { ok: false, code: 'bad-request', message: 'sessionId is required' }
  const agent = ctx.get('agents')?.get(sessionId)
  if (agent === undefined) return { ok: false, code: 'not-live', message: 'the continuation agent is not live' }
  agent.inbox.clear()
  return { ok: true }
}

async function serveUndo(ctx, req, res, peer, run) {
  if (peer?.principal?.kind !== 'owner') {
    sendJson(res, 403, { ok: false, code: 'forbidden', message: 'owner access required' })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'POST required' })
    return
  }
  let body
  try {
    body = await readJson(req)
  } catch (error) {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: String(error) })
    return
  }
  try {
    sendJson(res, 200, await run(body))
  } catch (error) {
    sendJson(res, 500, { ok: false, code: 'internal-error', message: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Validate the live session and locate the surface range to rewind.
 *
 * The conversation is rewound in place (opencode-style): a surface replacement
 * shadows every model-visible node after the boundary, keeping the same session
 * and the append-only durable log. The first surface node (system prompt) is
 * protected, so rewinding before the first message is refused.
 * @returns the session and replacement range, or a refusal code.
 */
export function surfaceRewindRange(ctx, sessionId, boundary) {
  const session = ctx.get('sessions')?.get(sessionId)
  if (session === undefined) return { code: 'not-live', message: 'open the session before undoing' }
  const nodes = session.surface.nodes
  const startIdx = nodes.findIndex(seq => seq > boundary)
  if (startIdx < 0) return { code: 'nothing-to-rewind', message: 'no conversation after this point' }
  if (startIdx === 0) return { code: 'no-prior-turn', message: 'cannot rewind before the first message' }
  return { session, startSeq: nodes[startIdx], endSeq: nodes[nodes.length - 1], shadowed: nodes.slice(startIdx) }
}

/** Locate the surface range to shadow when rewinding to a target user-message seq. */
export function surfaceRangeBySeq(session, targetSeq) {
  const nodes = session.surface.nodes
  const startIdx = nodes.indexOf(targetSeq)
  if (startIdx < 0) return { code: 'not-on-surface', message: 'the target is no longer in the model context (shadowed by compaction)' }
  if (startIdx === 0) return { code: 'no-prior-turn', message: 'cannot rewind before the first message' }
  return { startSeq: nodes[startIdx], endSeq: nodes[nodes.length - 1], shadowed: nodes.slice(startIdx) }
}

/** The turn number containing a log seq, from turn/start boundaries. */
export function turnOfSeq(events, seq) {
  let turn
  for (const event of events) {
    if (event.seq > seq) break
    if (event.type === 'turn/start') turn = event.data?.turn
  }
  return turn
}

/** Wait for an agent to reach idle via its activity promise, bounded by a deadline. */
async function waitForAgentIdle(agent, signal, timeoutMs = 15000) {
  if (signal?.aborted) return false
  let timer
  let onAbort
  try {
    await Promise.race([
      agent.whenIdle(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('idle wait timed out')), timeoutMs)
        onAbort = () => reject(new Error('idle wait aborted'))
        signal?.addEventListener('abort', onAbort, { once: true })
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Execute an in-place rewind to a target user-message seq (the /rewind engine).
 *
 * Stops a running turn, reverts the target turn's own file changes (mode 'both',
 * conflict-aware), then appends a surface-replace marker that cuts the model
 * context from the target onward — same session, append-only log. The returned
 * marker seq goes into the command result so the client can derive the hidden
 * transcript span from the durable command node.
 * @returns the marker seq + prompt + file report, or a refusal code.
 */
export async function executeRewind(ctx, config, executable, snapshots, agent, targetSeq, mode, signal) {
  const session = agent.session
  const sessionId = session.id
  if (session.header.origin === 'subagent' || (session.header.delegationDepth ?? 0) > 0) {
    return { code: 'subagent', message: 'cannot rewind a subagent session' }
  }
  if (agent.status !== 'idle') {
    agent.cancel({ kind: 'user' }, { keepInbox: true })
    const stopped = await waitForAgentIdle(agent, signal)
    if (!stopped) return { code: 'session-busy', message: 'the session is running and could not be stopped' }
  }
  const events = session.snapshotEvents()
  const targetEvent = events.find(event => event.seq === targetSeq)
  if (targetEvent === undefined || targetEvent.type !== 'user/message' || targetEvent.data?.source?.kind !== 'user') {
    return { code: 'not-a-user-message', message: 'the target is not a user message' }
  }
  const range = surfaceRangeBySeq(session, targetSeq)
  if (range.code !== undefined) return range
  const turn = turnOfSeq(events, targetSeq)
  const prompt = textOf(targetEvent.data.content)

  // A steering / mid-turn user message is not the turn's first prompt, but the
  // file snapshot spans the whole turn, so restoring files for it would be
  // inaccurate. Force conversation-only for such targets even if 'both' was asked
  // (the UI already disables it; this guards the hand-typed command path too).
  let effectiveMode = mode
  if (mode === 'both' && turn !== undefined) {
    const turnStart = events.find(event => event.type === 'turn/start' && event.data?.turn === turn)
    const firstUser = turnStart === undefined ? undefined
      : events.find(event => event.type === 'user/message' && event.data?.source?.kind === 'user' && event.seq > turnStart.seq)
    if (firstUser === undefined || firstUser.seq !== targetSeq) effectiveMode = 'chat'
  }

  let reverted = []
  let conflicts = []
  let fileSnapshot = false
  if (effectiveMode === 'both' && turn !== undefined) {
    const snapshot = snapshots.get(`${sessionId}#${turn}`)
    if (snapshot?.startTree != null && snapshot?.endTree != null) {
      const exe = await executable()
      if (exe !== null) {
        const workSignal = signal ?? new AbortController().signal
        const workspace = await locateWorkspace(ctx, config, exe, snapshot.cwd, workSignal)
        if (workspace !== null) {
          const result = await revertTurn(ctx, config, exe, workspace, snapshot.startTree, snapshot.endTree, workSignal)
          reverted = result.reverted
          conflicts = result.conflicts
          fileSnapshot = true
        }
      }
    }
  }

  // Non-empty placeholder content: a strict OpenAI-compatible gateway rejects an
  // empty user message, and the marker stays in the model surface tail.
  const marker = deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: '(empty message)' }],
    source: { kind: 'user' },
  })
  const markerEvent = session.append('user/message', marker, {
    surfaceOp: { op: 'replace', startSeq: range.startSeq, endSeq: range.endSeq },
    sourceEventSeqs: range.shadowed,
  })
  ctx.logger.info('session-undo: rewound %s to seq %d (turn %s, %d files reverted, %d conflicts)', sessionId, targetSeq, turn, reverted.length, conflicts.length)
  return { markerSeq: markerEvent.seq, prompt, turn, reverted, conflicts, fileSnapshot }
}

/**
 * Preview the file impact of rewinding to a target seq (mode 'both' confirmation).
 * Resolves the target's turn, reads its snapshot, and dry-runs the conflict-aware
 * diff. Returns no files when there is no snapshot (conversation-only fallback).
 * @param body - `{ sessionId, seq }`.
 * @returns `{ fileSnapshot, files: [{path, action, conflict}] }`.
 */
export async function previewRewind(ctx, config, executable, snapshots, body) {
  const sessionId = body.sessionId
  const seq = body.seq
  if (typeof sessionId !== 'string' || !Number.isSafeInteger(seq)) {
    return { ok: false, code: 'bad-request', message: 'sessionId and an integer seq are required' }
  }
  const live = ctx.get('sessions')?.get(sessionId)
  let events
  if (live !== undefined) {
    events = live.snapshotEvents()
  } else {
    const observed = await ctx.sessionQuery.observeSession(sessionId)
    try { events = observed.events } finally { observed[Symbol.dispose]?.() }
  }
  const turn = turnOfSeq(events, seq)
  const empty = { ok: true, data: { fileSnapshot: false, files: [] } }
  if (turn === undefined) return empty
  const snapshot = snapshots.get(`${sessionId}#${turn}`)
  if (snapshot?.startTree == null || snapshot?.endTree == null) return empty
  const exe = await executable()
  if (exe === null) return empty
  const workspace = await locateWorkspace(ctx, config, exe, snapshot.cwd, new AbortController().signal)
  if (workspace === null) return empty
  const files = await previewTurn(ctx, config, exe, workspace, snapshot.startTree, snapshot.endTree, new AbortController().signal)
  return { ok: true, data: { fileSnapshot: true, files } }
}

/** The constant marker content; such rows are rewind markers, not candidates. */
const MARKER_TEXT = '(empty message)'

/**
 * List the rewind candidates of a live session: human user messages still on the
 * model surface, newest first (the top row is the most recent / default pick).
 * Withdrawn messages and rewind markers are excluded. Cold sessions list nothing.
 * @param body - `{ sessionId }`.
 * @returns `{ candidates: [{seq, time, preview}] }`.
 */
export function listCandidates(ctx, body) {
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string') return { ok: false, code: 'bad-request', message: 'sessionId is required' }
  const session = ctx.get('sessions')?.get(sessionId)
  if (session === undefined) return { ok: true, data: { candidates: [] } }
  const surface = new Set(session.surface.nodes)
  const events = session.snapshotEvents()
  const candidates = []
  for (let index = events.length - 1; index >= 0 && candidates.length < 100; index--) {
    const event = events[index]
    if (event.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    if (!surface.has(event.seq)) continue
    const text = textOf(event.data.content).replace(/\s+/gu, ' ').trim()
    if (text === MARKER_TEXT || text === '[rewound]') continue
    const preview = text.length <= 80 ? text : `${text.slice(0, 79)}…`
    candidates.push({ seq: event.seq, time: event.time, preview, text })
  }
  return { ok: true, data: { candidates } }
}

/** List the recorded turn snapshots for one session, newest first. */
export function listSnapshots(snapshots, body) {
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string') return { ok: false, code: 'bad-request', message: 'sessionId is required' }
  const turns = [...snapshots.values()]
    .filter(record => record.sessionId === sessionId && record.turn >= 0)
    .sort((left, right) => right.turn - left.turn)
    .map(record => ({ turn: record.turn, time: record.time }))
  return { ok: true, data: { turns } }
}

/** Drop snapshot metadata older than the retention window. */
export async function purge(ctx, config, snapshots, persist) {
  const cutoff = Date.now() - config.retentionDays * DAY_MS
  let removed = 0
  for (const [key, record] of snapshots) {
    if (record.time < cutoff) {
      snapshots.delete(key)
      removed++
    }
  }
  if (removed > 0) await persist()
  return { ok: true, data: { removed } }
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const parsed = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be a JSON object')
  return parsed
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}