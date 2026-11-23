# dsh-session-delete

English | [中文](README.zh.md)

A DeepSeek Harness **bundle plugin** for session cleanup and turn undo:

- **Delete sessions** (single or batch) from the sidebar context menu, including
  artifact cleanup and an optional reference-counted attachment GC.
- **Rewind the conversation** from a ↶ icon on each user message: pick a mode
  (conversation only, or conversation + files with a file-list confirmation),
  withdraw that message and everything after it in the **same session**,
  conflict-aware revert the files it changed, and restore the prompt to the
  composer. Also via `/rewind` with a keyboard-navigable candidate picker (in the
  spirit of opencode `/undo`, Claude Code `/rewind`, and Antigravity rewind).

It is installed into a profile, so it lives **outside** the Harness repository: pulling upstream Harness code never touches it.

```
right-click a session → 删除会话 (Delete session)
right-click a workspace → 批量清理会话 (Clean up sessions)
assistant message action strip → ↶ 回退此轮 (Undo this turn)
```

The delete entry sits directly below the built-in `归档会话` (Archive session) entry, in the danger colour.

## What it deletes

Deletion is permanent; there is no trash. For the target Session only:

| Artifact | Location |
|---|---|
| Session log, every generation and compressed copy | `$DSH_HOME/projects/<project>/sessions/<id>/` |
| Projection-cache document | storage domain `session_projcache`, table `sessions` |
| Large tool-output spill files | `<tmp>/dsh-spill-*/session-<hash>/` |
| Worktree | through the shipped reclamation: removed only when the checkout is clean and unreferenced; **the branch is kept** |
| Workspace membership, pin, archive entry | `workspaceRegistry` |
| Scheduled work targeting it | stopped first, so a later wake cannot recreate the Session |

## What it keeps

| Kept | Why |
|---|---|
| Shared attachments and uploaded files (`attachments/v1/objects|files`) | Content-addressed and shared across Sessions; Harness ships no reference-counting collector yet, so deleting them per Session would break other Sessions |
| Workspace directories, code, user files | Unrelated to the Session record |
| Every other Session | Only the target directory is touched |

## Guards

Every guard runs on the Host; the dialog only presents its answer. The dialog
itself is the confirmation — there is no title to type by default.

- **A Session opened this run is deletable.** Its planned work is stopped, it is
  archived (which blocks any new turn), and an in-flight turn is awaited to
  finish and flush before the directory is removed, so nothing recreates it.
  A turn that will not settle within `stopSettleMs` is refused as `still-running`.
- **Running work asks first.** A turn, subagent, job, or schedule still active is
  reported as `needs-stop`; confirming "Stop and delete" cancels it, then deletes.
- **Migration-pending logs are refused.** Open the Session once so it migrates, then delete it.
- **Only the JSONL backend is supported.** Any other `location.kind` is refused rather than guessed at.
- **Worktree safety** is the shipped one: `git status` must be clean, the checkout must be unreferenced elsewhere, and `git worktree remove` runs without `--force`. A dirty worktree is retained and reported; the Session log is still deleted.

There is no age threshold on a manual deletion: naming one Session is an explicit
choice. An age-based threshold belongs to batch cleanup, which is not implemented yet.

## Configuration

The bundle patch mounts one row. Override its `config` in your profile's `cordis.patch.yml`:

```yaml
- id: session-delete
  config:
    requireTitleConfirmation: false  # true adds a type-the-title gate on top of the dialog
    deleteSpillArtifacts: true
    worktreeTimeoutMs: 20000         # how long to wait for the shipped worktree reclamation
    stopSettleMs: 8000               # how long to wait for a stopped turn to finish before deleting
    spillRoots: []                   # extra spill roots beside the discovered dsh-spill-* ones
    snapshotEnabled: true            # record per-turn git snapshots for undo
    retentionDays: 7                 # purge undo snapshot metadata after N days
    timeoutMs: 30000                 # per-git-command timeout for undo snapshots
    outputMaxBytes: 8388608          # git output cap for undo snapshots
    dataRoot: ''                     # undo data root; empty = ~/.dsh/session-undo
    snapshotExcludes:                # heavy dirs kept out of undo snapshots
      - node_modules/
      - .git/
      - __pycache__/
      - .venv/
      - venv/
      - .next/
      - .cache/
      - .turbo/
```

## Batch cleanup

The workspace right-click menu gains **Clean up sessions** (above "delete workspace"). It opens a picker listing that workspace's sessions with checkboxes:

- **Select all / Clear**, or **select older than N days** (the age helper lives here, not on a single manual deletion).
- Each row shows the title, size, last activity, and a running badge.
- **Deep attachment cleanup** (off by default): after deleting the selected sessions, removes attachment objects that those sessions referenced **and no remaining session references**. Anything still used by another session or at workspace level is kept. This is reference-counted, so shared attachments are never deleted out from under a live session.

Confirming deletes the selected sessions through the same safe path as a single deletion (stop running work, archive, await the turn, remove the directory), then runs the attachment GC and reports deleted counts and freed bytes.

## Conversation rewind (opencode / Claude Code-style)

A rewind icon (↶, "Rewind to here") appears in each **user message's** action row.
Clicking it opens a mode chooser:

- **Conversation only** — withdraws that message and everything after it from the
  conversation; files are left untouched.
- **Conversation and files** — first shows the list of files that turn changed
  (restore / remove, with later-modified files flagged as *skipped*), then asks
  for confirmation before reverting them together with the conversation.

You can also type **`/rewind`** in the composer: a candidate picker lists the
reachable user messages (newest first, searchable) with native **↑/↓ / Enter /
Esc** keyboard navigation; picking one opens the same mode chooser. The
parameterized form `/rewind @<seq> chat|both` executes directly.

How it works (two halves):

1. **Model context** — the Host appends a surface-replace marker that shadows the
   target message and everything after it, in the **same session**. The
   append-only durable log is never rewritten; no fork, no new window.
2. **Rendered transcript** — a client wrapper over the chat view builder hides the
   withdrawn rows (DSH's surface replacement alone only cuts the model context).
   The cut span is derived from the durable rewind command node, so hiding
   survives a page reload.
3. **Prompt restored** — the withdrawn message's text is put back into the
   composer (facade `setDraft`, with a DOM fallback) to edit and re-send.

**Your latest code is safe.** File revert is conflict-aware: only files the turn
changed are considered, and a file modified *after* the turn is skipped (left
untouched); a file the turn never touched is never modified. Rewinding an old
turn never clobbers newer work.

Snapshots use a **shadow git repository** under the plugin data root (the
opencode approach), so file restore works for **git and non-git workspaces alike**
and never touches your own repository. `.gitignore` and `snapshotExcludes` (heavy
dirs like `node_modules`) are respected. A running turn is stopped before
rewinding; subagent sessions are rewind-inert. Limits: snapshots are recorded
from install/restart onward and purged after `retentionDays`; a message already
shadowed by compaction cannot be rewound to (it is no longer in the model
context); a nested git directory is snapshotted as a gitlink, not file-by-file.

The transcript-hiding and user-row seams are private DSH surfaces: both are
shape-checked and restored on unload, so a DSH upgrade degrades gracefully
(model rewind + file restore + prompt refill still work) rather than breaking the
plugin or the delete feature.

## Install

```sh
dsh plugin install <absolute path to this directory>
```

or through the Plugin Manager (`install_bundle` with the bundle directory as target). The plugin ships plain JavaScript for both halves, so installation runs no build step.

After installing, refresh the Web page once; the entry appears on the next right-click.

## How the two halves talk

The Node half registers owner-only HTTP routes (all require `peer.principal.kind === 'owner'`):

- `POST /session-delete/inspect|delete|batch-inspect|batch-delete` — inventory, deletion (or a `needs-stop` reply), and batch cleanup with reference-counted attachment GC.
- `POST /session-undo/preview|candidates|snapshots|purge|clear-queue` — file-impact preview, rewind candidate list, and snapshot store maintenance.

It also registers the `/rewind` command (appends a surface-replace marker to cut the model context and reverts the turn's files conflict-aware) and records a shadow-git snapshot at each turn start/end.

The Web half (`client.js`) is a hand-written Client bundle in the `__ModuleLoader__.load` format (no build toolchain; only the shell baseline `react` and `@deepseek-ai/dsh-client-ui-primitives`). It registers the context menus and `shell.overlay` dialogs, mounts ↶ on user/steering rows, wraps the chat view builder to hide withdrawn rows (cuts derived from the durable rewind command node), and drives `/rewind @<seq> chat|both` — judging success by the command's settled outcome, then refilling the composer via `setDraft` (DOM fallback). All in the same session, no fork.

## Known limitations

- A live Session's in-memory object stays attached after deletion (Harness has no public eviction API). It is archived, so it runs no further turn and appends nothing; the sidebar row is removed on refresh. The orphan is released when the process exits.
- A deleted Session's id stays in the Workspace registry's in-memory header index until the next start; the row is removed immediately and the stale index entry is unreachable from the UI.
- Lineage: deleting a Session that other Sessions forked from leaves their `parentSession` pointing at nothing. The dialog warns with the child count; only the displayed lineage is affected.
- Rewind snapshots start at install/restart; earlier turns have none (file restore falls back to conversation-only). Snapshots auto-purge after `retentionDays` (metadata **and** the shadow-git objects via `git gc`), and are forgotten when a session is deleted. A nested git directory (gitlink) cannot be reverted file-by-file and is skipped as a conflict. Rewind cuts the model context via a surface replacement and hides the transcript client-side (same session; the durable log keeps the withdrawn turns). Only the turn's own changes are reverted; files modified afterward are skipped. A message already shadowed by compaction cannot be rewound to; steering targets support conversation-only rewind.
- Legacy `[rewound]` markers written by the old prepare path have no command node, so their withdrawn rows may reappear after upgrade (the model context is still cut); new rewinds use command nodes and stay hidden across reloads.
- The ↶ action mounts on the user/steering message row by taking over the shipped row component (a private seam, shape-checked and restored on unload); the transcript-hiding wraps the chat view builder (also private). Both degrade gracefully if a DSH upgrade changes their shape.

## Development

```sh
node tests/host.test.mjs      # delete / batch + route/command registration (13 tests)
node tests/undo.test.mjs      # rewind planning, real git/non-git conflict-aware restore (15 tests)
node tests/client.test.mjs    # chat-visibility cut derivation + hiding (4 tests)
```

`node --test tests/` spawns a child process per file, which some sandboxes block; running the file directly keeps the run in-process.

## Credits

The session delete / batch cleanup / reference-counted attachment GC and the
git-shadow-snapshot conflict-aware file restore are original to this plugin.

The in-place conversation-rewind mechanism is adapted from
[`SiriLee/dsh-rewind`](https://github.com/SiriLee/dsh-rewind) (MIT): the
chat-snapshot visibility wrapper, the user/steering row action mount, the
`/rewind` popupSelect command decoration, and the surface-replace marker
approach follow its design and code. Used under the MIT license with attribution.

## License

MIT