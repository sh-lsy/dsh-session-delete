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
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PREPARE_PATH = '/session-undo/prepare'
const SNAPSHOTS_PATH = '/session-undo/snapshots'
const PURGE_PATH = '/session-undo/purge'
const CLEAR_QUEUE_PATH = '/session-undo/clear-queue'
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
    await mkdir(join(gitDir, 'info'), { recursive: true })
    await writeFile(join(gitDir, 'info', 'exclude'), `${config.snapshotExcludes.join('\n')}\n`)
  }
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

/** Blob oid a tree holds at a path, or null when absent or not a blob. */
async function treeBlobOid(ctx, config, executable, workspace, tree, path, signal) {
  const result = await runGit(ctx, config, executable, ['ls-tree', tree, '--', path], { cwd: workspace.root, env: workspace.env, signal })
  if (result.exitCode !== 0) return null
  const match = /^\d+ blob ([0-9a-f]+)\t/.exec(result.stdout.split('\n')[0] ?? '')
  return match ? match[1] : null
}

/** Current work-tree blob oid of a path, or null when the file is absent. */
async function currentOid(ctx, config, executable, workspace, path, signal) {
  const result = await runGit(ctx, config, executable, ['hash-object', '--', path], { cwd: workspace.root, env: workspace.env, signal })
  if (result.exitCode !== 0) return null
  return result.stdout.trim() || null
}

/**
 * Conflict-aware revert of one turn's own file changes.
 *
 * Only files the turn changed (diff start→end) are considered, and each is
 * reverted only when its current content still equals the turn's end state.
 * A file modified after the turn is skipped and reported as a conflict; a file
 * the turn never touched is never modified. The latest code is therefore
 * preserved even when undoing an old turn.
 * @returns reverted paths and skipped conflict paths.
 */
export async function revertTurn(ctx, config, executable, workspace, startTree, endTree, signal) {
  const diff = await runGit(ctx, config, executable, ['diff', '--name-only', '-z', startTree, endTree], { cwd: workspace.root, env: workspace.env, signal })
  if (diff.exitCode !== 0) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
  const paths = diff.stdout.split('\0').filter(Boolean)
  const scratch = await mkdtemp(join(workspace.objects, 'revert-'))
  const reverted = []
  const conflicts = []
  try {
    const env = { ...workspace.env, GIT_INDEX_FILE: join(scratch, 'index') }
    for (const path of paths) {
      const endOid = await treeBlobOid(ctx, config, executable, workspace, endTree, path, signal)
      const startOid = await treeBlobOid(ctx, config, executable, workspace, startTree, path, signal)
      const curOid = await currentOid(ctx, config, executable, workspace, path, signal)
      const unchangedSinceTurn = endOid !== null ? curOid === endOid : curOid === null
      if (!unchangedSinceTurn) {
        conflicts.push(path)
        continue
      }
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

/** Join the text blocks of a message content array. */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n')
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
  let loaded = false
  let writeTail = Promise.resolve()

  const load = async () => {
    if (loaded) return
    loaded = true
    await mkdir(root, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(storeFile, 'utf8'))
      for (const record of parsed) snapshots.set(`${record.sessionId}#${record.turn}`, record)
    } catch {
      // A missing or unreadable store starts empty.
    }
  }
  const persist = () => {
    writeTail = writeTail.then(async () => {
      await writeFile(storeFile, JSON.stringify([...snapshots.values()]))
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
  void load()

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

  route(PREPARE_PATH, body => prepare(ctx, config, executable, snapshots, body))
  route(SNAPSHOTS_PATH, body => listSnapshots(snapshots, body))
  route(PURGE_PATH, () => purge(ctx, config, snapshots, persist))
  route(CLEAR_QUEUE_PATH, body => clearQueue(ctx, body))
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

/**
 * Undo one turn in place: revert the turn's own file changes (conflict-aware)
 * and shadow the turn from the model-visible conversation surface, keeping the
 * same session. Returns the undone prompt for the composer.
 */
export async function prepare(ctx, config, executable, snapshots, body) {
  const sessionId = body.sessionId
  const messageId = body.messageId
  if (typeof sessionId !== 'string' || typeof messageId !== 'string') {
    return { ok: false, code: 'bad-request', message: 'sessionId and messageId are required' }
  }
  if (ctx.get('agents')?.get(sessionId)?.status === 'running') {
    return { ok: false, code: 'session-busy', message: 'the session is running a turn; stop it before undoing' }
  }
  const observed = await ctx.sessionQuery.observeSession(sessionId)
  let rewind
  try {
    rewind = resolveRewind(observed.events, messageId)
  } finally {
    observed[Symbol.dispose]?.()
  }
  if (rewind.code !== undefined) {
    return { ok: false, code: rewind.code, message: `cannot undo: ${rewind.code}` }
  }
  // Validate the in-place conversation rewind before touching any files.
  const range = surfaceRewindRange(ctx, sessionId, rewind.boundary)
  if (range.code !== undefined) return { ok: false, code: range.code, message: range.message }

  // File revert is best-effort: conversation rewind works even without a snapshot.
  let reverted = []
  let conflicts = []
  let fileSnapshot = false
  const snapshot = snapshots.get(`${sessionId}#${rewind.turn}`)
  if (snapshot?.startTree != null && snapshot?.endTree != null) {
    const exe = await executable()
    if (exe !== null) {
      const workspace = await locateWorkspace(ctx, config, exe, snapshot.cwd, new AbortController().signal)
      if (workspace !== null) {
        const result = await revertTurn(ctx, config, exe, workspace, snapshot.startTree, snapshot.endTree, new AbortController().signal)
        reverted = result.reverted
        conflicts = result.conflicts
        fileSnapshot = true
      }
    }
  }

  // Commit the in-place surface replacement: same session, view truncated.
  // Imported lazily so the module loads under plain-node unit tests; at runtime
  // the profile's linked-root resolution maps the core package.
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  range.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '[rewound]' }],
    source: { kind: 'user' },
  }), {
    surfaceOp: { op: 'replace', startSeq: range.startSeq, endSeq: range.endSeq },
    sourceEventSeqs: range.shadowed,
  })
  ctx.logger.info('session-undo: rewound %s turn %d in place (%d files reverted, %d conflicts)', sessionId, rewind.turn, reverted.length, conflicts.length)
  return { ok: true, data: { prompt: rewind.prompt, turn: rewind.turn, reverted, conflicts, fileSnapshot } }
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