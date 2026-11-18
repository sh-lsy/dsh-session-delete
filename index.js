/**
 * Host half of `@sh-lsy/dsh-session-delete`.
 *
 * Permanently removes one stored Session and the artifacts it owns. The Web
 * half calls two owner-only routes; nothing here is exposed to a non-owner
 * Peer and nothing is registered as a model-facing tool, because deletion is
 * irreversible and belongs to the user alone.
 *
 * Removal order is chosen so every irreversible step happens once and every
 * later step is idempotent:
 *   1. guards (format, backend) — a Session opened this run is deletable too,
 *   2. stop planned work, then archive — the archive set is what the worktree
 *      reclamation reads to stop counting this Session as a referrer, and the
 *      archive gate blocks any new turn,
 *   3. for a live Session, wait for its in-flight turn to finish and flush so
 *      nothing recreates the directory after it is removed,
 *   4. wait for the worktree reclamation to settle,
 *   5. delete the Session directory (all generations),
 *   6. delete spill output and the projection-cache document,
 *   7. drop Workspace accounting, the pin, and the archive entry.
 *
 * @module @sh-lsy/dsh-session-delete
 */
import { createHash } from 'node:crypto'
import { readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { mountUndo, resolveUndoConfig, undoDefaults } from './undo-host.js'

/** Cordis plugin name. */
export const name = 'session-delete'

/** Required services; optional ones are read with `ctx.get()`. */
export const inject = ['webServer', 'sessionPersistence', 'workspaceRegistry', 'subprocess', 'sessionQuery']

const INSPECT_PATH = '/session-delete/inspect'
const DELETE_PATH = '/session-delete/delete'
const BATCH_INSPECT_PATH = '/session-delete/batch-inspect'
const BATCH_DELETE_PATH = '/session-delete/batch-delete'
const MAX_BODY_BYTES = 64 * 1024
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$/u
const SPILL_ROOT = /^dsh-spill-[A-Za-z0-9]{6}$/u
const PROJECTION_CACHE_DOMAIN = 'session_projcache'
const PROJECTION_CACHE_TABLE = 'sessions'

/** Defaults for the row's `config`; every field is overridable from `cordis.patch.yml`. */
export function defaultConfig() {
  return {
    requireTitleConfirmation: false,
    deleteSpillArtifacts: true,
    worktreeTimeoutMs: 20_000,
    stopSettleMs: 8_000,
    spillRoots: [],
    ...undoDefaults(),
  }
}

/**
 * Validate the Loader-supplied config.
 * @param raw - the row's `config` object, or undefined.
 * @returns a complete resolved config.
 */
export function resolveConfig(raw) {
  const base = defaultConfig()
  if (raw === undefined || raw === null) return base
  if (typeof raw !== 'object') throw new TypeError('session-delete: config must be an object')
  const duration = (key) => {
    const value = raw[key] ?? base[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`session-delete: config.${key} must be a non-negative number`)
    }
    return value
  }
  const spillRoots = raw.spillRoots ?? base.spillRoots
  if (!Array.isArray(spillRoots) || spillRoots.some(root => typeof root !== 'string' || root === '')) {
    throw new TypeError('session-delete: config.spillRoots must be an array of non-empty strings')
  }
  const flag = (key) => {
    const value = raw[key] ?? base[key]
    if (typeof value !== 'boolean') throw new TypeError(`session-delete: config.${key} must be a boolean`)
    return value
  }
  return {
    requireTitleConfirmation: flag('requireTitleConfirmation'),
    deleteSpillArtifacts: flag('deleteSpillArtifacts'),
    worktreeTimeoutMs: duration('worktreeTimeoutMs'),
    stopSettleMs: duration('stopSettleMs'),
    spillRoots: [...spillRoots],
    ...resolveUndoConfig(raw),
  }
}

/**
 * Mount the owner-only routes: single inspect/delete and batch inspect/delete.
 * @param ctx - Host context carrying `webServer`, `sessionPersistence`, and `workspaceRegistry`.
 * @param rawConfig - the row's config object.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const route = (path, run, batch = false) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path,
    auth: 'required',
    handler: (req, res, peer) => (batch ? serveBatch : serve)(req, res, peer, run),
  }), `session-delete: POST ${path}`)
  route(INSPECT_PATH, body => inspectSession(ctx, config, body.sessionId))
  route(DELETE_PATH, body => deleteSession(ctx, config, body))
  route(BATCH_INSPECT_PATH, body => batchInspect(ctx, config, body.workspaceId), true)
  route(BATCH_DELETE_PATH, body => batchDelete(ctx, config, body), true)
  mountUndo(ctx, config)
}

/**
 * Owner gate, method gate, and bounded JSON parse shared by every route.
 * @returns the parsed body, or undefined when a failure response was already sent.
 */
async function admitJson(req, res, peer) {
  if (peer?.principal?.kind !== 'owner') {
    sendJson(res, 403, { ok: false, code: 'forbidden', message: 'owner access required' })
    return undefined
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { ok: false, code: 'method-not-allowed', message: 'POST required' })
    return undefined
  }
  try {
    return await readJson(req)
  } catch (error) {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: messageOf(error) })
    return undefined
  }
}

/** Answer one single-session route, validating the named sessionId. */
async function serve(req, res, peer, run) {
  const body = await admitJson(req, res, peer)
  if (body === undefined) return
  if (typeof body.sessionId !== 'string' || !SESSION_ID.test(body.sessionId)) {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: 'sessionId is missing or malformed' })
    return
  }
  try {
    sendJson(res, 200, await run(body))
  } catch (error) {
    sendJson(res, 500, { ok: false, code: 'internal-error', message: messageOf(error) })
  }
}

/** Answer one batch route; the operation validates its own body fields. */
async function serveBatch(req, res, peer, run) {
  const body = await admitJson(req, res, peer)
  if (body === undefined) return
  try {
    sendJson(res, 200, await run(body))
  } catch (error) {
    sendJson(res, 500, { ok: false, code: 'internal-error', message: messageOf(error) })
  }
}

/**
 * Report one Session's deletion preconditions and artifact inventory.
 * Read-only: nothing is written, stopped, or removed.
 * @param ctx - Host context.
 * @param config - resolved plugin config.
 * @param sessionId - the Session named by the caller.
 * @returns `{ ok, data }` or `{ ok: false, code, message }`.
 */
export async function inspectSession(ctx, config, sessionId) {
  const snapshot = await ctx.sessionPersistence.stat(sessionId)
  if (snapshot === undefined) {
    return { ok: false, code: 'not-found', message: `session "${sessionId}" does not exist` }
  }
  const header = snapshot.header
  const lastActivity = await lastActivityOf(snapshot)
  const live = isLive(ctx, sessionId)
  const reasons = []
  if (snapshot.formatStatus === 'migration-required') {
    reasons.push({
      code: 'migration-required',
      message: 'the stored log predates this format; open the Session once to migrate it, then delete it',
    })
  }
  if (snapshot.location?.kind !== 'jsonl') {
    reasons.push({
      code: 'unsupported-backend',
      message: 'only the shipped JSONL persistence backend is supported',
    })
  }
  const worktrees = ownedWorktrees(ctx, header)
  return {
    ok: true,
    data: {
      sessionId,
      createdAt: header.createdAt,
      lastActivity,
      sizeBytes: snapshot.sizeBytes ?? null,
      directory: snapshot.location?.path === undefined ? null : dirname(snapshot.location.path),
      eligible: reasons.length === 0,
      reasons,
      // A Session opened this run is deletable too: its work is stopped and its
      // turn awaited before the directory is removed, so nothing recreates it.
      live,
      runningTurn: live && ctx.get('agents')?.get(sessionId)?.status === 'running',
      childSessions: await countChildren(ctx, sessionId),
      worktree: worktrees[0]?.worktree ?? null,
      archived: ctx.workspaceRegistry.archivedSessionIds.includes(sessionId),
      pinned: ctx.workspaceRegistry.pinnedSessionIds.includes(sessionId),
      requireTitleConfirmation: config.requireTitleConfirmation,
    },
  }
}

/**
 * Permanently delete one Session and the artifacts it owns.
 * @param ctx - Host context.
 * @param config - resolved plugin config.
 * @param request - `{ sessionId, confirmTitle?, acknowledged?, stopActivity? }`.
 * @returns the deletion report, a refusal, or a stop request.
 */
export async function deleteSession(ctx, config, request) {
  const sessionId = request.sessionId
  const inspected = await inspectSession(ctx, config, sessionId)
  if (inspected.ok !== true) return inspected
  const data = inspected.data
  if (!data.eligible) {
    const [first] = data.reasons
    return { ok: false, code: first.code, message: first.message, details: data }
  }
  if (config.requireTitleConfirmation) {
    if (request.acknowledged !== true || typeof request.confirmTitle !== 'string' || request.confirmTitle.trim() === '') {
      return { ok: false, code: 'title-required', message: 'explicit acknowledgement is required' }
    }
  }

  const warnings = []
  const activity = await ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
  if (Array.isArray(activity) && activity.length > 0) {
    if (request.stopActivity !== true) {
      return { ok: false, code: 'needs-stop', message: 'planned work must be stopped first', activity }
    }
    try {
      await ctx.parallel('workspace/session-stop', { sessionId })
    } catch (error) {
      warnings.push(`stop: ${messageOf(error)}`)
    }
  }

  try {
    await ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true })
  } catch (error) {
    // Reclamation treats a Session outside the archive set as a referrer of its
    // own checkout, so a failed archive retains the worktree instead of failing
    // the deletion.
    warnings.push(`archive: ${messageOf(error)}`)
  }

  // A live Agent holds an open write handle. Archiving blocks new turns, but a
  // turn already in flight must finish and flush before the directory goes, or
  // its closing append would recreate the deleted Session. An idle live Session
  // passes immediately; a stopped one settles within the bounded wait.
  if (data.live && !(await waitForIdle(ctx, sessionId, config.stopSettleMs))) {
    return {
      ok: false,
      code: 'still-running',
      message: 'the Session is still running a turn; stop it and try again',
      details: { worktree: null, warnings },
    }
  }

  const worktree = await reclaimWorktree(ctx, config, sessionId, data.worktree)

  try {
    await removeWithRetry(data.directory)
  } catch (error) {
    return {
      ok: false,
      code: 'delete-failed',
      message: `could not remove ${String(data.directory)}: ${messageOf(error)}`,
      details: { stage: 'session-directory', worktree, warnings },
    }
  }

  const spill = config.deleteSpillArtifacts ? await removeSpill(config, sessionId, warnings) : []
  const projectionCache = await dropProjectionCache(ctx, sessionId, warnings)
  await dropAccounting(ctx, sessionId, warnings)
  ctx.logger.info(
    'session-delete: removed Session %s (%d bytes, worktree %s)',
    sessionId, data.sizeBytes ?? 0, worktree.status,
  )
  return {
    ok: true,
    data: {
      status: 'deleted',
      sessionId,
      bytes: data.sizeBytes ?? null,
      worktree,
      projectionCache,
      spill,
      warnings,
    },
  }
}

/** Whether the Session is attached to this process's stores. */
function isLive(ctx, sessionId) {
  return ctx.get('sessions')?.get(sessionId) !== undefined
    || ctx.get('agents')?.get(sessionId) !== undefined
}

/**
 * List one Workspace's Sessions with their deletion preconditions, for the
 * batch-cleanup picker. Read-only.
 * @param ctx - Host context.
 * @param config - resolved plugin config.
 * @param workspaceId - the Workspace whose Sessions are listed.
 * @returns `{ ok, data: { workspaceId, sessions } }` or a refusal.
 */
export async function batchInspect(ctx, config, workspaceId) {
  const workspace = typeof workspaceId === 'string' ? ctx.workspaceRegistry.get(workspaceId) : undefined
  if (workspace === undefined) {
    return { ok: false, code: 'not-found', message: `workspace "${String(workspaceId)}" does not exist` }
  }
  const sessions = []
  for (const sessionId of workspace.sessionIds) {
    const inspected = await inspectSession(ctx, config, sessionId)
    if (inspected.ok !== true) {
      sessions.push({ sessionId, eligible: false, reasons: [{ code: inspected.code, message: inspected.message }] })
      continue
    }
    sessions.push({
      sessionId,
      sizeBytes: inspected.data.sizeBytes,
      lastActivity: inspected.data.lastActivity,
      live: inspected.data.live,
      runningTurn: inspected.data.runningTurn,
      eligible: inspected.data.eligible,
      reasons: inspected.data.reasons,
    })
  }
  return { ok: true, data: { workspaceId, path: workspace.path, sessions } }
}

/**
 * Delete several Sessions in one call, then optionally reclaim attachments that
 * only the deleted Sessions referenced.
 *
 * Attachment reclamation is reference-counted: an object is removed only when a
 * deleted Session referenced it AND no remaining Session does. Anything still
 * used elsewhere — workspace-level or another Session's — is kept.
 * @param ctx - Host context.
 * @param config - resolved plugin config.
 * @param request - `{ sessionIds: string[], deepAttachments?: boolean }`.
 * @returns per-session results, freed bytes, and the attachment report.
 */
export async function batchDelete(ctx, config, request) {
  const ids = Array.isArray(request.sessionIds)
    ? [...new Set(request.sessionIds.filter(id => typeof id === 'string' && SESSION_ID.test(id)))]
    : []
  if (ids.length === 0) {
    return { ok: false, code: 'bad-request', message: 'sessionIds must be a non-empty array of session ids' }
  }
  const deep = request.deepAttachments === true
  const warnings = []

  // Capture the deleted Sessions' attachment references before their logs go.
  const deletedRefs = new Set()
  if (deep) {
    for (const id of ids) for (const hex of await refsOfSession(ctx, id)) deletedRefs.add(hex)
  }

  const results = []
  let freedBytes = 0
  for (const sessionId of ids) {
    const outcome = await deleteSession(ctx, config, { sessionId, stopActivity: true, acknowledged: true })
    if (outcome.ok === true) {
      freedBytes += outcome.data.bytes ?? 0
      results.push({ sessionId, ok: true, bytes: outcome.data.bytes ?? null })
    } else {
      results.push({ sessionId, ok: false, code: outcome.code, message: outcome.message })
    }
  }

  let attachments = { removed: 0, kept: 0, freedBytes: 0 }
  if (deep) {
    const remainingRefs = new Set()
    for (const snapshot of await ctx.sessionPersistence.list()) {
      for (const hex of await refsOfSession(ctx, snapshot.header.id)) remainingRefs.add(hex)
    }
    const reclaimable = new Set([...deletedRefs].filter(hex => !remainingRefs.has(hex)))
    attachments = await reclaimAttachments(ctx, reclaimable, warnings)
    attachments.kept = deletedRefs.size - reclaimable.size
  }

  ctx.logger.info('session-delete: batch removed %d/%d sessions (%d bytes), attachments %j',
    results.filter(r => r.ok).length, ids.length, freedBytes, attachments)
  return { ok: true, data: { results, freedBytes, attachments, warnings } }
}

/**
 * Every attachment sha256 referenced by one Session's log.
 *
 * Reads the decoded log and extracts content-addressed ids; an unreadable or
 * absent Session contributes nothing. Matching over text is conservative: a
 * hash mentioned only as prose still counts as a reference, which keeps an
 * object rather than risking a wrong deletion.
 * @param ctx - Host context.
 * @param sessionId - the Session whose references are collected.
 * @returns the set of 64-hex attachment digests.
 */
async function refsOfSession(ctx, sessionId) {
  const refs = new Set()
  let handle
  try {
    handle = await ctx.sessionPersistence.open(sessionId, 'read')
    const { events } = await handle.read()
    for (const match of JSON.stringify(events).matchAll(/sha256:([a-f0-9]{64})/gu)) refs.add(match[1])
  } catch {
    // A Session that cannot be read contributes no references.
  } finally {
    await handle?.close().catch(() => {})
  }
  return refs
}

/**
 * Remove content-addressed attachment objects no remaining Session references.
 * @param ctx - Host context.
 * @param reclaimable - the 64-hex digests proven unreferenced by remaining Sessions.
 * @param warnings - sink for non-fatal removal failures.
 * @returns counts and freed bytes (alias hardlinks are not double counted).
 */
async function reclaimAttachments(ctx, reclaimable, warnings) {
  const root = ctx.get('attachments')?.root
  if (root === undefined || reclaimable.size === 0) return { removed: 0, kept: 0, freedBytes: 0 }
  let removed = 0
  let freedBytes = 0
  for (const hex of reclaimable) {
    const bucket = hex.slice(0, 2)
    // The normalized image and the verbatim file object hold the real bytes;
    // the files/ tree is hardlinked aliases, removed without counting bytes.
    const dataPaths = [join(root, 'objects', bucket, hex), join(root, 'file-objects', bucket, hex)]
    const aliasPath = join(root, 'files', bucket, hex)
    let touched = false
    for (const path of dataPaths) {
      try {
        const identity = await stat(path)
        await rm(path, { force: true })
        freedBytes += identity.size
        touched = true
      } catch (error) {
        if (error?.code !== 'ENOENT') warnings.push(`attachment ${hex}: ${messageOf(error)}`)
      }
    }
    try {
      await rm(aliasPath, { recursive: true, force: true })
    } catch (error) {
      if (error?.code !== 'ENOENT') warnings.push(`attachment alias ${hex}: ${messageOf(error)}`)
    }
    if (touched) removed++
  }
  return { removed, kept: 0, freedBytes }
}

/**
 * Wait until the Session's Agent is no longer running a turn.
 *
 * The archive admission reports a running turn as activity and the stop path
 * cancels it without awaiting settlement, so the caller polls here before
 * removing the directory. An idle or absent Agent resolves at once.
 * @param ctx - Host context.
 * @param sessionId - the Session whose Agent is watched.
 * @param timeoutMs - bounded wait before reporting the turn still running.
 * @returns true once no turn is running, false when the wait expired.
 */
async function waitForIdle(ctx, sessionId, timeoutMs) {
  const running = () => ctx.get('agents')?.get(sessionId)?.status === 'running'
  const deadline = Date.now() + timeoutMs
  while (running() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return !running()
}

/** The Session's own recorded checkouts, newest first, when the projection cache holds them. */
function ownedWorktrees(ctx, header) {
  const cached = ctx.get('sessionProjectionCache')?.cachedSnapshot?.(header, ['worktree'])
  const created = cached?.values?.worktree
  if (!Array.isArray(created)) return []
  return created.filter(entry => entry?.owned === true && typeof entry?.worktree?.path === 'string')
}

/**
 * Wait for the shipped worktree reclamation to settle for this Session.
 *
 * A checkout is removed only when the official inspection proves it clean and
 * unreferenced; the branch is never deleted. Every other outcome retains it,
 * which the caller reports instead of failing the Session deletion.
 */
async function reclaimWorktree(ctx, config, sessionId, owned) {
  if (owned === null || owned === undefined) return { status: 'absent' }
  const worktrees = ctx.get('worktrees')
  if (worktrees === undefined) return { status: 'unavailable', path: owned.path, branch: owned.branch }
  const settled = await new Promise((resolve) => {
    let done = false
    const finish = (status) => {
      if (done) return
      done = true
      dispose()
      clearTimeout(timer)
      resolve(status)
    }
    const dispose = ctx.on('worktree/cleanup', (info) => {
      if (info?.sessionId !== sessionId) return
      const status = info?.cleanup?.status
      if (status === 'scheduled') return
      finish(status)
    })
    const timer = setTimeout(() => finish('timeout'), config.worktreeTimeoutMs)
  })
  return { status: settled, path: owned.path, branch: owned.branch }
}

/** Most recent activity: the header timestamp or the log's own mtime, whichever is later. */
async function lastActivityOf(snapshot) {
  const path = snapshot.location?.path
  const createdAt = snapshot.header.createdAt ?? 0
  if (path === undefined) return createdAt
  try {
    const identity = await stat(path)
    return Math.max(createdAt, identity.mtimeMs)
  } catch {
    return createdAt
  }
}

/** Number of Sessions that name this one as their fork parent. */
async function countChildren(ctx, sessionId) {
  try {
    const stored = await ctx.sessionPersistence.list()
    return stored.filter(entry => entry.header.parentSession === sessionId).length
  } catch {
    return 0
  }
}

/** Delete spill output for this Session across the default and configured roots. */
async function removeSpill(config, sessionId, warnings) {
  const hash = createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
  const name = `session-${hash}`
  const roots = new Set(config.spillRoots)
  try {
    for (const entry of await readdir(tmpdir(), { withFileTypes: true })) {
      if (entry.isDirectory() && SPILL_ROOT.test(entry.name)) roots.add(join(tmpdir(), entry.name))
    }
  } catch (error) {
    warnings.push(`spill-scan: ${messageOf(error)}`)
  }
  const removed = []
  for (const root of roots) {
    const directory = join(root, name)
    try {
      const identity = await stat(directory)
      if (!identity.isDirectory()) continue
      await rm(directory, { recursive: true, force: true })
      removed.push(directory)
    } catch (error) {
      if (error?.code !== 'ENOENT') warnings.push(`spill: ${directory}: ${messageOf(error)}`)
    }
  }
  return removed
}

/** Drop this Session's projection-cache document from the already-open domain. */
async function dropProjectionCache(ctx, sessionId, warnings) {
  const domain = ctx.get('storageDomain')?.get?.(PROJECTION_CACHE_DOMAIN)
  const table = domain?.table?.(PROJECTION_CACHE_TABLE)
  if (table === undefined) return false
  try {
    await table.delete(sessionId)
    return true
  } catch (error) {
    warnings.push(`projection-cache: ${messageOf(error)}`)
    return false
  }
}

/** Remove the Workspace accounting, the pin, and the archive entry this deletion invalidates. */
async function dropAccounting(ctx, sessionId, warnings) {
  const registry = ctx.workspaceRegistry
  for (const workspace of registry.list()) {
    if (!workspace.sessionIds.includes(sessionId)) continue
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      warnings.push(`workspace-account: ${messageOf(error)}`)
    }
  }
  if (registry.pinnedSessionIds.includes(sessionId)) {
    try {
      await registry.unpinSession(sessionId)
    } catch (error) {
      warnings.push(`unpin: ${messageOf(error)}`)
    }
  }
  if (registry.archivedSessionIds.includes(sessionId)) {
    try {
      await registry.unarchiveSession(sessionId)
    } catch (error) {
      warnings.push(`unarchive: ${messageOf(error)}`)
    }
  }
}

/** Remove one tree, retrying the transient Windows handle contention a live GUI can cause. */
async function removeWithRetry(directory, attempts = 3) {
  let last
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      last = error
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 150 * 2 ** attempt))
    }
  }
  throw last
}

/** Read one bounded JSON body. */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const parsed = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be a JSON object')
  return parsed
}

/** Answer one JSON response. */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Read a message off an arbitrary thrown value. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}