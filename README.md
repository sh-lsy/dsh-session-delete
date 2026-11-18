# dsh-session-delete

A DeepSeek Harness **bundle plugin** that permanently deletes one stored Session and the artifacts it owns, from the sidebar context menu.

It is installed into a profile, so it lives **outside** the Harness repository: pulling upstream Harness code never touches it.

```
right-click a session → 删除会话 (Delete session)
```

The entry sits directly below the built-in `归档会话` (Archive session) entry, in the danger colour.

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
```

## Batch cleanup

The workspace right-click menu gains **Clean up sessions** (above "delete workspace"). It opens a picker listing that workspace's sessions with checkboxes:

- **Select all / Clear**, or **select older than N days** (the age helper lives here, not on a single manual deletion).
- Each row shows the title, size, last activity, and a running badge.
- **Deep attachment cleanup** (off by default): after deleting the selected sessions, removes attachment objects that those sessions referenced **and no remaining session references**. Anything still used by another session or at workspace level is kept. This is reference-counted, so shared attachments are never deleted out from under a live session.

Confirming deletes the selected sessions through the same safe path as a single deletion (stop running work, archive, await the turn, remove the directory), then runs the attachment GC and reports deleted counts and freed bytes.

## Install

```sh
dsh plugin install <absolute path to this directory>
```

or through the Plugin Manager (`install_bundle` with the bundle directory as target). The plugin ships plain JavaScript for both halves, so installation runs no build step.

After installing, refresh the Web page once; the entry appears on the next right-click.

## How the two halves talk

The Node half registers two owner-only HTTP routes:

- `POST /session-delete/inspect` — read-only inventory and refusal reasons.
- `POST /session-delete/delete` — the deletion, or a `needs-stop` reply listing planned work.

Both require `peer.principal.kind === 'owner'`. The Web half (`client.js`) is a hand-written Client bundle in the `__ModuleLoader__.load` format, so it needs no build toolchain and no imports beyond the shell baseline (`react`, `@deepseek-ai/dsh-client-ui-primitives`).

## Known limitations

- A live Session's in-memory object stays attached after deletion (Harness has no public eviction API). It is archived, so it runs no further turn and appends nothing; the sidebar row is removed on refresh. The orphan is released when the process exits.
- A deleted Session's id stays in the Workspace registry's in-memory header index until the next start; the row is removed immediately and the stale index entry is unreachable from the UI.
- Lineage: deleting a Session that other Sessions forked from leaves their `parentSession` pointing at nothing. The dialog warns with the child count; only the displayed lineage is affected.
- Batch cleanup and automatic retention are not implemented. An age threshold would apply there, not to a manual deletion.

## Development

```sh
node tests/host.test.mjs      # Host-half behaviour; no build, no network
```

`node --test tests/` spawns a child process per file, which some sandboxes block; running the file directly keeps the run in-process.

## License

MIT