window.__ModuleLoader__.load({
  id: '@sh-lsy/dsh-session-delete',
  factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/**
 * Web half of `@sh-lsy/dsh-session-delete`.
 *
 * A danger-coloured "Delete session" entry below the built-in archive entry,
 * and one minimal confirmation dialog. The Host owns every guard; this half
 * presents the session, collects the confirmation, and refreshes the list.
 */
const React = require('react')

// The design-system primitives are a shell baseline module. A plugin bundle is
// loaded through the module table, whose interop shape this package cannot
// assume, so a missing export degrades to a self-contained overlay rather than
// an undefined component that renders nothing.
let primitiveModule = {}
try {
  primitiveModule = require('@deepseek-ai/dsh-client-ui-primitives') ?? {}
} catch (error) {
  console.warn('session-delete: design-system primitives unavailable, using the built-in overlay', error)
}

const NS = 'sessionDelete'
const INSPECT_PATH = '/session-delete/inspect'
const DELETE_PATH = '/session-delete/delete'
const BATCH_INSPECT_PATH = '/session-delete/batch-inspect'
const BATCH_DELETE_PATH = '/session-delete/batch-delete'
const MENU_ORDER = 700 // the built-in archive contribution sits at 600
const STYLE_ID = 'session-delete-styles'

const DICT = {
  zh: {
    'menu.deleteSession': '删除会话',
    'dialog.title': '永久删除会话',
    'dialog.warning': '此操作不可恢复，会话记录与产物将从磁盘永久删除',
    'dialog.scope': '将删除会话日志、缓存与工具产物；共享附件与工作区文件保留',
    'dialog.meta': '占用 {size} · 最后活动 {time}',
    'dialog.liveHint': '该会话本次运行中打开过，删除时会先停止其工作',
    'dialog.worktree': '工作树 {path}（{branch}）仅在无未提交改动时删除，分支保留',
    'dialog.children': '有 {n} 个分叉子会话，删除后其谱系将显示为断开',
    'dialog.blocked': '当前不允许删除',
    'dialog.cancel': '取消',
    'dialog.delete': '删除',
    'dialog.deleting': '正在删除…',
    'dialog.doneClose': '完成',
    'dialog.success': '会话已永久删除',
    'dialog.successSize': '已释放 {size}',
    'dialog.needsStopTitle': '该会话仍有计划中的工作',
    'dialog.needsStopDesc': '先停止以下工作，否则日后唤醒会重建已删除的会话',
    'dialog.stopAndDelete': '停止并删除',
    'dialog.loading': '正在检查…',
    'failure.deleteSession': '删除会话失败',
    'reason.migration-required': '该会话日志是旧格式，请先打开一次完成迁移后再删除',
    'reason.unsupported-backend': '仅支持官方默认的 JSONL 持久化后端',
    'reason.still-running': '该会话仍在运行轮次，请先停止再删除',
    'reason.not-found': '该会话不存在，可能已被删除',
    'reason.delete-failed': '删除失败：',
    'reason.network': '与后台的通信失败',
    'menu.batchCleanup': '批量清理会话',
    'batch.title': '批量清理会话',
    'batch.warning': '将永久删除所选会话，运行中的工作会先停止；此操作不可恢复',
    'batch.deepLabel': '深度清理附件',
    'batch.deepHint': '仅删除所选会话产生、且其他会话不再引用的附件；工作区仍在用的保留',
    'batch.selectAll': '全选',
    'batch.selectNone': '清空',
    'batch.olderThan': '选择天以上',
    'batch.apply': '应用',
    'batch.empty': '该工作区没有会话',
    'batch.loading': '正在加载会话…',
    'batch.live': '运行中',
    'batch.meta': '{size} · {time}',
    'batch.deleteSelected': '删除所选（{n}）',
    'batch.deleting': '正在删除…',
    'batch.done': '完成',
    'batch.resultTitle': '清理完成',
    'batch.resultSessions': '删除 {ok}/{total} 个会话，释放 {size}',
    'batch.resultAttachments': '附件：删除 {removed} 个，保留 {kept} 个，释放 {size}',
    'batch.resultFailed': '部分会话未删除',
    'batch.cancel': '取消',
    'batch.confirmWarning': '确认永久删除所选 {n} 个会话？此操作不可恢复',
    'batch.confirmDeep': '将同时深度清理无人引用的附件',
    'batch.confirmNoDeep': '不清理附件',
    'batch.back': '返回',
    'batch.confirmDelete': '确认删除',
  },
  en: {
    'menu.deleteSession': 'Delete session',
    'dialog.title': 'Permanently delete session',
    'dialog.warning': 'This cannot be undone; the session record and its artifacts are permanently removed from disk',
    'dialog.scope': 'Deletes the session log, caches, and tool artifacts; shared attachments and workspace files are kept',
    'dialog.meta': '{size} · last active {time}',
    'dialog.liveHint': 'This session was opened during this run; its work is stopped before deletion',
    'dialog.worktree': 'Worktree {path} ({branch}) is removed only when clean; the branch is kept',
    'dialog.children': '{n} forked child session(s) will show a broken lineage',
    'dialog.blocked': 'Deletion is not allowed',
    'dialog.cancel': 'Cancel',
    'dialog.delete': 'Delete',
    'dialog.deleting': 'Deleting…',
    'dialog.doneClose': 'Done',
    'dialog.success': 'Session permanently deleted',
    'dialog.successSize': 'Freed {size}',
    'dialog.needsStopTitle': 'This session still has planned work',
    'dialog.needsStopDesc': 'Stop this work first, or a later wake would recreate the deleted session',
    'dialog.stopAndDelete': 'Stop and delete',
    'dialog.loading': 'Checking…',
    'failure.deleteSession': 'Session deletion failed',
    'reason.migration-required': 'This session log uses an older format; open it once to migrate, then delete it',
    'reason.unsupported-backend': 'Only the shipped JSONL persistence backend is supported',
    'reason.still-running': 'This session is still running a turn; stop it and try again',
    'reason.not-found': 'This session does not exist; it may already be deleted',
    'reason.delete-failed': 'Deletion failed: ',
    'reason.network': 'Communication with the Host failed',
    'menu.batchCleanup': 'Clean up sessions',
    'batch.title': 'Clean up sessions',
    'batch.warning': 'Permanently deletes the selected sessions; running work is stopped first. This cannot be undone',
    'batch.deepLabel': 'Deep attachment cleanup',
    'batch.deepHint': 'Only removes attachments the selected sessions produced and no remaining session references; workspace-level ones are kept',
    'batch.selectAll': 'Select all',
    'batch.selectNone': 'Clear',
    'batch.olderThan': 'Select older than (days)',
    'batch.apply': 'Apply',
    'batch.empty': 'This workspace has no sessions',
    'batch.loading': 'Loading sessions…',
    'batch.live': 'running',
    'batch.meta': '{size} · {time}',
    'batch.deleteSelected': 'Delete selected ({n})',
    'batch.deleting': 'Deleting…',
    'batch.done': 'Done',
    'batch.resultTitle': 'Cleanup complete',
    'batch.resultSessions': 'Deleted {ok}/{total} sessions, freed {size}',
    'batch.resultAttachments': 'Attachments: removed {removed}, kept {kept}, freed {size}',
    'batch.resultFailed': 'Some sessions were not deleted',
    'batch.cancel': 'Cancel',
    'batch.confirmWarning': 'Permanently delete the {n} selected sessions? This cannot be undone',
    'batch.confirmDeep': 'Also deep-cleans attachments no remaining session references',
    'batch.confirmNoDeep': 'Attachments are not cleaned',
    'batch.back': 'Back',
    'batch.confirmDelete': 'Confirm delete',
  },
  ja: {
    'menu.deleteSession': 'セッションを削除',
    'dialog.title': 'セッションを完全に削除',
    'dialog.warning': '元に戻せません。セッション記録と成果物がディスクから完全に削除されます',
    'dialog.scope': 'セッションログ・キャッシュ・ツール成果物を削除します。共有添付とワークスペースのファイルは保持します',
    'dialog.cancel': 'キャンセル',
    'dialog.delete': '削除',
    'dialog.deleting': '削除中…',
    'dialog.doneClose': '完了',
    'dialog.success': 'セッションを完全に削除しました',
    'dialog.stopAndDelete': '停止して削除',
    'dialog.needsStopTitle': 'このセッションには予定された作業があります',
    'dialog.blocked': '削除できません',
  },
  es: {
    'menu.deleteSession': 'Eliminar sesión',
    'dialog.title': 'Eliminar la sesión permanentemente',
    'dialog.warning': 'No se puede deshacer; el registro y sus artefactos se eliminan del disco permanentemente',
    'dialog.scope': 'Elimina el registro, las cachés y los artefactos; los adjuntos compartidos y los archivos del workspace se conservan',
    'dialog.cancel': 'Cancelar',
    'dialog.delete': 'Eliminar',
    'dialog.deleting': 'Eliminando…',
    'dialog.doneClose': 'Hecho',
    'dialog.success': 'Sesión eliminada permanentemente',
    'dialog.stopAndDelete': 'Detener y eliminar',
    'dialog.needsStopTitle': 'Esta sesión aún tiene trabajo planificado',
    'dialog.blocked': 'No se permite eliminar',
  },
  fr: {
    'menu.deleteSession': 'Supprimer la session',
    'dialog.title': 'Supprimer définitivement la session',
    'dialog.warning': 'Action irréversible ; la session et ses artefacts sont définitivement supprimés du disque',
    'dialog.scope': "Supprime le journal, les caches et les artefacts ; les pièces jointes partagées et les fichiers de l'espace de travail sont conservés",
    'dialog.cancel': 'Annuler',
    'dialog.delete': 'Supprimer',
    'dialog.deleting': 'Suppression…',
    'dialog.doneClose': 'Terminé',
    'dialog.success': 'Session supprimée définitivement',
    'dialog.stopAndDelete': 'Arrêter et supprimer',
    'dialog.needsStopTitle': 'Cette session a encore du travail planifié',
    'dialog.blocked': 'Suppression impossible',
  },
  de: {
    'menu.deleteSession': 'Sitzung löschen',
    'dialog.title': 'Sitzung endgültig löschen',
    'dialog.warning': 'Nicht umkehrbar; Sitzungsprotokoll und Artefakte werden endgültig von der Platte gelöscht',
    'dialog.scope': 'Löscht Protokoll, Caches und Artefakte; geteilte Anhänge und Workspace-Dateien bleiben erhalten',
    'dialog.cancel': 'Abbrechen',
    'dialog.delete': 'Löschen',
    'dialog.deleting': 'Wird gelöscht…',
    'dialog.doneClose': 'Fertig',
    'dialog.success': 'Sitzung endgültig gelöscht',
    'dialog.stopAndDelete': 'Stoppen und löschen',
    'dialog.needsStopTitle': 'Diese Sitzung hat noch geplante Arbeit',
    'dialog.blocked': 'Löschen nicht erlaubt',
  },
  ru: {
    'menu.deleteSession': 'Удалить сеанс',
    'dialog.title': 'Удалить сеанс безвозвратно',
    'dialog.warning': 'Отменить нельзя; запись сеанса и его артефакты безвозвратно удаляются с диска',
    'dialog.scope': 'Удаляет журнал, кэши и артефакты; общие вложения и файлы рабочего пространства сохраняются',
    'dialog.cancel': 'Отмена',
    'dialog.delete': 'Удалить',
    'dialog.deleting': 'Удаление…',
    'dialog.doneClose': 'Готово',
    'dialog.success': 'Сеанс удалён безвозвратно',
    'dialog.stopAndDelete': 'Остановить и удалить',
    'dialog.needsStopTitle': 'У сеанса ещё есть запланированная работа',
    'dialog.blocked': 'Удаление запрещено',
  },
  pt: {
    'menu.deleteSession': 'Excluir sessão',
    'dialog.title': 'Excluir sessão permanentemente',
    'dialog.warning': 'Não pode ser desfeito; o registro e seus artefatos são removidos do disco permanentemente',
    'dialog.scope': 'Exclui o log, os caches e os artefatos; anexos compartilhados e arquivos do workspace são mantidos',
    'dialog.cancel': 'Cancelar',
    'dialog.delete': 'Excluir',
    'dialog.deleting': 'Excluindo…',
    'dialog.doneClose': 'Concluído',
    'dialog.success': 'Sessão excluída permanentemente',
    'dialog.stopAndDelete': 'Parar e excluir',
    'dialog.needsStopTitle': 'Esta sessão ainda tem trabalho planejado',
    'dialog.blocked': 'Exclusão não permitida',
  },
}

// Token-only stylesheet, injected directly so it applies regardless of the
// module stylesheet pipeline. Values reuse the design-system alias tokens and
// the product's 13px detail scale; the dialog stays as minimal as the built-in
// stop-and-archive confirmation.
const SESSION_DELETE_CSS = `
.sd-dialog.sd-dialog { width: min(440px, 100%); max-height: 100%; overflow: hidden; }
.sd-batch-dialog.sd-batch-dialog { width: min(560px, 100%); max-height: 100%; overflow: hidden; }
@supports (height: 100dvh) {
  .sd-dialog.sd-dialog, .sd-batch-dialog.sd-batch-dialog { max-height: calc(100dvh - 48px); }
}
.sd-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.sd-notice {
  margin: 0 0 14px; padding: 10px 12px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px; line-height: 20px; font-weight: 400;
  overflow-wrap: anywhere;
}
.sd-name { margin: 0 0 2px; font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.sd-id { margin: 0 0 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-caption); overflow-wrap: anywhere; }
.sd-meta { margin: 0 0 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.sd-scope { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.sd-hint { margin: 10px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-caption); overflow-wrap: anywhere; }
.sd-error { margin: 10px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.sd-list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.sd-list li { overflow-wrap: anywhere; }
.sd-status { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.sd-delete:not(:disabled) { color: var(--dsw-alias-state-error-primary); }
.sd-btn-cancel { min-width: 72px; }
.sd-btn-confirm { min-width: 136px; }
.sd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 10px; }
.sd-link { padding: 0; border: none; background: none; cursor: pointer; font-size: 12px; line-height: 18px; color: var(--dsw-alias-link); }
.sd-days { width: 56px; height: 26px; padding: 2px 8px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font-size: 12px; }
.sd-list-box { max-height: min(360px, 48vh); overflow-y: auto; overscroll-behavior: contain; margin: 0 0 12px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-sm); }
.sd-row { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; cursor: pointer; }
.sd-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.sd-row + .sd-row { border-top: 0.5px solid var(--dsw-alias-border-l4); }
.sd-check { flex: none; margin: 0; accent-color: var(--dsw-alias-link); }
.sd-row-title { flex: 1; min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-row-meta { flex: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-caption); white-space: nowrap; font-variant-numeric: tabular-nums; }
.sd-badge { flex: none; font-size: 11px; line-height: 16px; color: var(--dsw-alias-state-warn-primary); }
.sd-deep { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.su-action {
  display: inline-flex; align-items: center; justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px; border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.su-action svg { width: calc(16px + var(--dsh-content-font-delta, 0px)); height: calc(16px + var(--dsh-content-font-delta, 0px)); }
@media (hover: hover) {
  .su-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
}
.su-dialog.su-dialog { width: min(440px, 100%); max-height: 100%; overflow: hidden; }
@supports (height: 100dvh) { .su-dialog.su-dialog { max-height: calc(100dvh - 48px); } }
.su-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.su-notice {
  margin: 0 0 14px; padding: 10px 12px; border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary);
  font-size: 13px; line-height: 20px; font-weight: 400; overflow-wrap: anywhere;
}
.su-text { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.su-error { margin: 10px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.su-btn-cancel { min-width: 72px; }
.su-btn-confirm { min-width: 136px; }
.su-delete:not(:disabled) { color: var(--dsw-alias-state-error-primary); }
`

/** Install the stylesheet once, directly into the document head. */
function injectStyles() {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = SESSION_DELETE_CSS
  document.head.appendChild(style)
}

/** Minimal modal used when the design-system primitives are unavailable. */
function FallbackModal(props) {
  if (props.open !== true) return null
  const { children, footer, title, onClose, closeLabel } = props
  const items = Array.isArray(children) ? children : [children]
  return React.createElement('div', {
    role: 'presentation',
    style: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45))' },
    onClick: onClose,
  }, React.createElement('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : undefined,
    style: { width: 'min(420px, 92vw)', maxHeight: '86vh', overflow: 'auto', padding: '22px 24px 24px', borderRadius: 'var(--dsw-radius-panel, 28px)', background: 'var(--dsw-alias-bg-layer-2, #1c1c1e)', color: 'var(--dsw-alias-label-primary, #eee)', boxShadow: 'var(--dsw-elevation-prominent, 0 18px 60px rgba(0,0,0,.45))', fontSize: '13px' },
    onClick: event => event.stopPropagation(),
  },
  React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
    React.createElement('strong', { style: { fontSize: '16px', fontWeight: 500 } }, title),
    React.createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose, style: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' } }, '×')),
  ...items,
  footer === undefined ? null : React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' } }, footer)))
}

/** Minimal button used with {@link FallbackModal}. */
function FallbackButton(props) {
  const { children, onClick, disabled } = props
  return React.createElement('button', {
    type: 'button', onClick, disabled,
    style: { padding: '6px 14px', borderRadius: '12px', border: '1px solid var(--dsw-alias-border-l4, #3a3a3c)', background: 'transparent', color: 'inherit', cursor: disabled === true ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: disabled === true ? .5 : 1 },
  }, children)
}

const { Modal = FallbackModal, Button = FallbackButton, Tooltip = FallbackTooltip } = primitiveModule

/** Minimal tooltip fallback when primitives are unavailable. */
function FallbackTooltip(props) { return props.children }

/** Minimal observable snapshot source for the registrant-private dialog request. */
function createSource(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** POST one JSON body and return the parsed envelope; network failures become a code. */
async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (text === '') return { ok: false, code: 'network', message: `empty response (${String(response.status)})` }
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, code: 'network', message: `unreadable response (${String(response.status)})` }
  }
}

/** Render a byte count. */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** Render one absolute time in the browser locale. */
function formatTime(value) {
  if (typeof value !== 'number' || value <= 0) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '—'
  }
}

/** Show one diagnostic in the page itself when the dialog cannot render. */
function showBanner(text) {
  try {
    const existing = document.getElementById('session-delete-diagnostic')
    const node = existing ?? document.createElement('div')
    node.id = 'session-delete-diagnostic'
    node.textContent = text
    node.style.cssText = 'position:fixed;z-index:2147483647;left:16px;bottom:16px;max-width:70vw;padding:10px 12px;border-radius:8px;background:#7f1d1d;color:#fff;font:13px/1.5 system-ui,sans-serif;white-space:pre-wrap;box-shadow:0 6px 24px rgba(0,0,0,.35)'
    if (existing === null) document.body.appendChild(node)
    setTimeout(() => { node.remove() }, 20000)
  } catch {
    // Diagnostics must never become the failure they report.
  }
}

let overlayReady = false
let dialogRendered = false

/** The confirmation dialog; it owns the request lifecycle for one session at a time. */
function DeleteDialog(props) {
  // The renderer binds every `hooks` source to a SELECTOR hook: it must be
  // called with a selection function (`useArchiveRequest(pending => pending)`).
  const request = typeof props.useRequest === 'function' ? props.useRequest(state => state) : null
  if (request !== null) dialogRendered = true
  const [phase, setPhase] = React.useState({ kind: 'idle' })

  React.useEffect(() => {
    if (request === null) {
      setPhase({ kind: 'idle' })
      return undefined
    }
    let cancelled = false
    setPhase({ kind: 'loading' })
    post(INSPECT_PATH, { sessionId: request.sessionId })
      .then((body) => {
        if (cancelled) return
        setPhase(body?.ok === true
          ? { kind: 'ready', data: body.data }
          : { kind: 'error', code: body?.code, message: body?.message })
      })
      .catch((error) => {
        if (!cancelled) setPhase({ kind: 'error', code: 'network', message: String(error) })
      })
    return () => { cancelled = true }
  }, [request])

  const t2 = (key) => (typeof props.translate === 'function' ? props.translate(key) : key)
  const close = () => {
    if (phase.kind === 'working') return
    props.dismiss()
  }
  const run = async (stopActivity) => {
    if (request === null || phase.kind === 'working') return
    setPhase({ kind: 'working', data: phase.data ?? null })
    const body = await post(DELETE_PATH, {
      sessionId: request.sessionId,
      acknowledged: true,
      ...(stopActivity === true ? { stopActivity: true } : {}),
    }).catch(error => ({ ok: false, code: 'network', message: String(error) }))
    if (body?.ok === true) {
      setPhase({ kind: 'done', data: body.data })
      try {
        props.refreshSessions()
      } catch { /* the list refresh is best-effort; the Host already deleted the session */ }
      return
    }
    if (body?.code === 'needs-stop') {
      setPhase({ kind: 'needs-stop', activity: body.activity ?? [], data: phase.data ?? null })
      return
    }
    setPhase({ kind: 'error', code: body?.code, message: body?.message, data: phase.data ?? null })
  }

  const title = request?.displayTitle ?? ''
  const data = phase.data ?? null
  const eligible = phase.kind === 'ready' && data?.eligible === true
  const canDelete = eligible

  const footer = (() => {
    if (phase.kind === 'done') {
      return React.createElement(Button, { variant: 'primary', onClick: close }, t2('dialog.doneClose'))
    }
    if (phase.kind === 'needs-stop') {
      return [
        React.createElement(Button, { key: 'cancel', variant: 'outline', onClick: close }, t2('dialog.cancel')),
        React.createElement(Button, { key: 'stop', variant: 'outline', className: 'sd-delete', onClick: () => { void run(true) } }, t2('dialog.stopAndDelete')),
      ]
    }
    return [
      React.createElement(Button, { key: 'cancel', variant: 'outline', className: 'sd-btn-cancel', disabled: phase.kind === 'working', onClick: close }, t2('dialog.cancel')),
      React.createElement(Button, {
        key: 'delete', variant: 'outline', className: 'sd-delete sd-btn-confirm',
        disabled: !canDelete || phase.kind === 'working',
        onClick: () => { void run(false) },
      }, phase.kind === 'working' ? t2('dialog.deleting') : t2('dialog.delete')),
    ]
  })()

  const children = []
  if (phase.kind === 'loading') {
    children.push(React.createElement('div', { key: 'loading', className: 'sd-status', role: 'status' }, t2('dialog.loading')))
  }
  if (data !== null && (phase.kind === 'ready' || phase.kind === 'working' || phase.kind === 'error')) {
    if (data.eligible !== true) {
      const reason = Array.isArray(data.reasons) && data.reasons.length > 0 ? data.reasons[0] : null
      children.push(React.createElement('div', { key: 'blocked', className: 'sd-notice', role: 'alert' },
        `${t2('dialog.blocked')} · ${reason === null ? '' : t2(`reason.${reason.code}`)}`))
    } else {
      children.push(React.createElement('div', { key: 'warning', className: 'sd-notice' }, t2('dialog.warning')))
    }
    children.push(React.createElement('div', { key: 'name', className: 'sd-name' }, title))
    children.push(React.createElement('div', { key: 'id', className: 'sd-id' }, request?.sessionId ?? ''))
    children.push(React.createElement('div', { key: 'meta', className: 'sd-meta' },
      t2('dialog.meta').replace('{size}', formatSize(data.sizeBytes)).replace('{time}', formatTime(data.lastActivity))))
    children.push(React.createElement('div', { key: 'scope', className: 'sd-scope' }, t2('dialog.scope')))
    if (data.live === true) {
      children.push(React.createElement('div', { key: 'live', className: 'sd-hint' }, t2('dialog.liveHint')))
    }
    if (data.worktree !== null && data.worktree !== undefined) {
      children.push(React.createElement('div', { key: 'worktree', className: 'sd-hint' },
        t2('dialog.worktree').replace('{path}', String(data.worktree.path)).replace('{branch}', String(data.worktree.branch ?? ''))))
    }
    if (typeof data.childSessions === 'number' && data.childSessions > 0) {
      children.push(React.createElement('div', { key: 'children', className: 'sd-hint' },
        t2('dialog.children').replace('{n}', String(data.childSessions))))
    }
  }
  if (phase.kind === 'needs-stop') {
    children.push(React.createElement('div', { key: 'stop-head', className: 'sd-notice' }, t2('dialog.needsStopTitle')))
    children.push(React.createElement('div', { key: 'stop-desc', className: 'sd-scope' }, t2('dialog.needsStopDesc')))
    children.push(React.createElement('ul', { key: 'stop-list', className: 'sd-list' },
      (phase.activity ?? []).map((entry, index) => React.createElement('li', { key: `${entry?.kind ?? 'work'}-${String(index)}` },
        `${String(entry?.kind ?? 'activity')}${entry?.label === undefined ? '' : `: ${String(entry.label)}`}`)),
    ))
  }
  if (phase.kind === 'done') {
    children.push(React.createElement('div', { key: 'done-head', className: 'sd-name' }, t2('dialog.success')))
    children.push(React.createElement('div', { key: 'done-size', className: 'sd-meta' },
      t2('dialog.successSize').replace('{size}', formatSize(phase.data?.bytes))))
  }
  if (phase.kind === 'error') {
    const reasonKey = phase.code === undefined ? undefined : `reason.${String(phase.code)}`
    const localized = reasonKey === undefined ? reasonKey : t2(reasonKey)
    children.push(React.createElement('div', { key: 'error', className: 'sd-error', role: 'alert' },
      localized === reasonKey || localized === undefined
        ? `${t2('reason.delete-failed')}${String(phase.message ?? phase.code ?? '')}`
        : localized))
  }

  return React.createElement(Modal, {
    open: request !== null,
    onClose: close,
    closeLabel: t2('dialog.cancel'),
    title: t2('dialog.title'),
    className: 'sd-dialog',
    contentClassName: 'sd-content',
    footer,
  }, ...children)
}

/** The batch-cleanup dialog: multi-select a workspace's sessions, optional attachment GC. */
function BatchDialog(props) {
  const request = typeof props.useBatchRequest === 'function' ? props.useBatchRequest(state => state) : null
  const [phase, setPhase] = React.useState({ kind: 'idle' })
  const [selected, setSelected] = React.useState(() => new Set())
  const [deep, setDeep] = React.useState(false)
  const [ageInput, setAgeInput] = React.useState('1')

  React.useEffect(() => {
    if (request === null) {
      setPhase({ kind: 'idle' })
      setSelected(new Set())
      setDeep(false)
      return undefined
    }
    let cancelled = false
    setPhase({ kind: 'loading' })
    setSelected(new Set())
    setDeep(false)
    post(BATCH_INSPECT_PATH, { workspaceId: request.workspaceId })
      .then((body) => {
        if (cancelled) return
        setPhase(body?.ok === true
          ? { kind: 'ready', sessions: body.data.sessions ?? [] }
          : { kind: 'error', message: body?.message })
      })
      .catch((error) => {
        if (!cancelled) setPhase({ kind: 'error', message: String(error) })
      })
    return () => { cancelled = true }
  }, [request])

  const t2 = (key) => (typeof props.translate === 'function' ? props.translate(key) : key)
  const titleOf = (id) => (typeof props.titleOf === 'function' ? props.titleOf(id) : id)
  const sessions = phase.sessions ?? []
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const selectOlder = () => {
    const days = Number(ageInput)
    if (!Number.isFinite(days) || days < 0) return
    const cutoff = Date.now() - days * 86_400_000
    setSelected(new Set(sessions.filter(s => (s.lastActivity ?? 0) <= cutoff).map(s => s.sessionId)))
  }
  const close = () => {
    if (phase.kind === 'working') return
    props.dismiss()
  }
  const requestConfirm = () => {
    if (selected.size === 0 || phase.kind !== 'ready') return
    setPhase({ kind: 'confirm', sessions })
  }
  const back = () => { setPhase({ kind: 'ready', sessions }) }
  const run = async () => {
    if (selected.size === 0 || phase.kind === 'working') return
    setPhase({ kind: 'working', sessions })
    const body = await post(BATCH_DELETE_PATH, { sessionIds: [...selected], deepAttachments: deep })
      .catch(error => ({ ok: false, message: String(error) }))
    if (body?.ok === true) {
      setPhase({ kind: 'done', data: body.data })
      try {
        props.refreshSessions()
      } catch { /* best-effort; the Host already deleted the sessions */ }
      return
    }
    setPhase({ kind: 'error', message: body?.message, sessions })
  }

  const footer = (() => {
    if (phase.kind === 'done') {
      return React.createElement(Button, { variant: 'primary', className: 'sd-btn-confirm', onClick: close }, t2('batch.done'))
    }
    if (phase.kind === 'confirm') {
      return [
        React.createElement(Button, { key: 'back', variant: 'outline', className: 'sd-btn-cancel', onClick: back }, t2('batch.back')),
        React.createElement(Button, { key: 'confirm', variant: 'outline', className: 'sd-delete sd-btn-confirm', onClick: () => { void run() } }, t2('batch.confirmDelete')),
      ]
    }
    return [
      React.createElement(Button, { key: 'cancel', variant: 'outline', className: 'sd-btn-cancel', disabled: phase.kind === 'working', onClick: close }, t2('batch.cancel')),
      React.createElement(Button, {
        key: 'delete', variant: 'outline', className: 'sd-delete sd-btn-confirm',
        disabled: selected.size === 0 || phase.kind !== 'ready',
        onClick: requestConfirm,
      }, phase.kind === 'working' ? t2('batch.deleting') : t2('batch.deleteSelected').replace('{n}', String(selected.size))),
    ]
  })()

  const children = []
  if (phase.kind === 'loading') {
    children.push(React.createElement('div', { key: 'loading', className: 'sd-status', role: 'status' }, t2('batch.loading')))
  }
  if (phase.kind === 'ready' || phase.kind === 'working') {
    children.push(React.createElement('div', { key: 'warning', className: 'sd-notice' }, t2('batch.warning')))
    children.push(React.createElement('div', { key: 'toolbar', className: 'sd-toolbar' },
      React.createElement('button', { type: 'button', className: 'sd-link', onClick: () => setSelected(new Set(sessions.map(s => s.sessionId))) }, t2('batch.selectAll')),
      React.createElement('button', { type: 'button', className: 'sd-link', onClick: () => setSelected(new Set()) }, t2('batch.selectNone')),
      React.createElement('input', {
        className: 'sd-days', type: 'number', min: '0', value: ageInput,
        'aria-label': t2('batch.olderThan'),
        onChange: event => { setAgeInput(event.target.value) },
      }),
      React.createElement('button', { type: 'button', className: 'sd-link', onClick: selectOlder }, t2('batch.olderThan')),
    ))
    if (sessions.length === 0) {
      children.push(React.createElement('div', { key: 'empty', className: 'sd-status' }, t2('batch.empty')))
    } else {
      children.push(React.createElement('div', { key: 'list', className: 'sd-list-box', role: 'group', 'aria-label': t2('batch.title') },
        sessions.map((session) => {
          const id = session.sessionId
          return React.createElement('label', { key: id, className: 'sd-row' },
            React.createElement('input', {
              type: 'checkbox', className: 'sd-check', checked: selected.has(id),
              onChange: () => { toggle(id) },
            }),
            React.createElement('span', { className: 'sd-row-title', title: titleOf(id) }, titleOf(id)),
            session.runningTurn === true ? React.createElement('span', { className: 'sd-badge' }, t2('batch.live')) : null,
            React.createElement('span', { className: 'sd-row-meta' },
              t2('batch.meta').replace('{size}', formatSize(session.sizeBytes)).replace('{time}', formatTime(session.lastActivity))),
          )
        }),
      ))
    }
    children.push(React.createElement('label', { key: 'deep', className: 'sd-deep' },
      React.createElement('input', { type: 'checkbox', className: 'sd-check', checked: deep, onChange: event => { setDeep(event.target.checked) } }),
      React.createElement('span', null,
        React.createElement('strong', { style: { fontWeight: 500 } }, t2('batch.deepLabel')),
        ` — ${t2('batch.deepHint')}`),
    ))
  }
  if (phase.kind === 'confirm') {
    children.push(React.createElement('div', { key: 'confirm-warning', className: 'sd-notice', role: 'alert' },
      t2('batch.confirmWarning').replace('{n}', String(selected.size))))
    children.push(React.createElement('div', { key: 'confirm-deep', className: 'sd-meta' },
      deep ? t2('batch.confirmDeep') : t2('batch.confirmNoDeep')))
    const chosen = sessions.filter(session => selected.has(session.sessionId))
    const chosenRows = chosen.map(session => React.createElement('div', { key: session.sessionId, className: 'sd-row' },
      React.createElement('span', { className: 'sd-row-title', title: titleOf(session.sessionId) }, titleOf(session.sessionId)),
      React.createElement('span', { className: 'sd-row-meta' }, formatSize(session.sizeBytes))))
    children.push(React.createElement('div', { key: 'confirm-list', className: 'sd-list-box', role: 'group', 'aria-label': t2('batch.confirmDelete') }, chosenRows))
  }
  if (phase.kind === 'done') {
    const data = phase.data ?? {}
    const ok = (data.results ?? []).filter(r => r.ok).length
    const total = (data.results ?? []).length
    children.push(React.createElement('div', { key: 'done-title', className: 'sd-name' }, t2('batch.resultTitle')))
    children.push(React.createElement('div', { key: 'done-sessions', className: 'sd-meta' },
      t2('batch.resultSessions').replace('{ok}', String(ok)).replace('{total}', String(total)).replace('{size}', formatSize(data.freedBytes))))
    if (data.attachments !== undefined) {
      children.push(React.createElement('div', { key: 'done-attachments', className: 'sd-meta' },
        t2('batch.resultAttachments')
          .replace('{removed}', String(data.attachments.removed))
          .replace('{kept}', String(data.attachments.kept))
          .replace('{size}', formatSize(data.attachments.freedBytes))))
    }
    const failed = (data.results ?? []).filter(r => !r.ok)
    if (failed.length > 0) {
      children.push(React.createElement('div', { key: 'done-failed', className: 'sd-error' },
        `${t2('batch.resultFailed')}：${failed.map(r => `${titleOf(r.sessionId)}（${r.code}）`).join('、')}`))
    }
  }
  if (phase.kind === 'error') {
    children.push(React.createElement('div', { key: 'error', className: 'sd-error', role: 'alert' },
      `${t2('reason.delete-failed')}${String(phase.message ?? '')}`))
  }

  return React.createElement(Modal, {
    open: request !== null,
    onClose: close,
    closeLabel: t2('batch.cancel'),
    title: t2('batch.title'),
    className: 'sd-batch-dialog',
    contentClassName: 'sd-content',
    footer,
  }, ...children)
}

/** Plugin `apply`: stylesheet, dictionaries, the context-menu entry, and the overlay dialog. */
// --- Turn undo (message action strip icon + confirmation + fork + prompt restore) ---

const UNDO_NS = 'sessionUndo'
const UNDO_DICT = {
  zh: {
    'action.undo': '回退此轮',
    'dialog.title': '回退此轮对话',
    'dialog.warning': '将在当前会话原地回退这一轮：还原该轮改过的文件（之后被改过的跳过、不动），把提示词放回输入框；不影响你最新的其他改动',
    'dialog.cancel': '取消',
    'dialog.confirm': '回退',
    'dialog.working': '正在回退…',
    'dialog.done': '完成',
    'dialog.doneTitle': '已回退',
    'dialog.doneDesc': '已回退，提示词已放回输入框',
    'dialog.doneReverted': '已还原 {n} 个文件',
    'dialog.doneConflicts': '{n} 个文件在该轮之后被修改过，已跳过、未改动',
    'dialog.failed': '回退失败：',
    'reason.session-busy': '该会话正在运行轮次，请先停止再回退',
    'reason.no-snapshot': '这一轮没有文件快照（快照未启用、已过期，或该轮在插件启用前）',
    'reason.no-git': 'git 不可用或工作区不是 git 仓库',
    'reason.no-prior-turn': '这是第一轮，没有可回退的前序状态',
    'reason.message-not-found': '找不到该消息对应的轮次',
    'reason.fork-failed': '分叉继续会话失败：',
  },
  en: {
    'action.undo': 'Undo this turn',
    'dialog.title': 'Undo this turn',
    'dialog.warning': 'Rewinds this turn in place in the current session: reverts the files it changed (later-modified files are skipped, untouched) and restores the prompt to the composer; your other latest changes are not affected',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'Undo',
    'dialog.working': 'Undoing…',
    'dialog.done': 'Done',
    'dialog.doneTitle': 'Undone',
    'dialog.doneDesc': 'Rewound; the prompt is restored to the composer',
    'dialog.doneReverted': 'Reverted {n} file(s)',
    'dialog.doneConflicts': '{n} file(s) were modified after this turn and were skipped (untouched)',
    'dialog.failed': 'Undo failed: ',
    'reason.session-busy': 'The session is running a turn; stop it before undoing',
    'reason.no-snapshot': 'No file snapshot for this turn (snapshots disabled, expired, or the turn predates the plugin)',
    'reason.no-git': 'git is unavailable or the workspace is not a git repository',
    'reason.no-prior-turn': 'This is the first turn; there is no prior state to revert to',
    'reason.message-not-found': 'No turn found for this message',
    'reason.fork-failed': 'Forking the continuation session failed: ',
  },
}

/** A left-curving undo arrow drawn in currentColor. */
function UndoIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  },
  React.createElement('path', { d: 'M6 3.5 2.5 7 6 10.5' }),
  React.createElement('path', { d: 'M2.5 7h6.5a4 4 0 0 1 0 8H7' }))
}

/** The undo icon contribution rendered in the assistant action strip. */
function UndoAction(props) {
  const label = typeof props.t === 'function' ? props.t('action.undo') : 'Undo this turn'
  return React.createElement(Tooltip, { label, side: 'bottom' },
    React.createElement('button', {
      type: 'button', className: 'su-action', 'aria-label': label,
      onClick: () => { props.undo(props.messageId) },
    }, React.createElement(UndoIcon)))
}

/** Restore the prompt to a session's composer draft once its shell is ready. */
function prefillDraft(ctx, sessionId, prompt) {
  if (prompt === '') return
  let tries = 0
  let reasserted = false
  const write = () => {
    const actx = ctx.sessions.scope?.(sessionId)
    if (actx === undefined) return false
    try {
      ctx.uiConversation.input.for(actx).setDraft(prompt)
      return true
    } catch {
      return false
    }
  }
  const attempt = () => {
    if (write()) {
      // Re-assert once after the shell finishes initializing, so a late
      // persisted-draft load does not replace the restored prompt.
      if (!reasserted) {
        reasserted = true
        setTimeout(write, 400)
      }
      return
    }
    if (tries++ < 50) setTimeout(attempt, 100)
  }
  attempt()
}

/** Run the undo in place: the Host reverts the turn's files and shadows the turn
 * from the conversation surface in the SAME session; restore the prompt to the
 * composer. No fork, no new window, no session deletion (opencode-style). */
async function runUndo(ctx, request) {
  const prepared = await post('/session-undo/prepare', { sessionId: request.sessionId, messageId: request.messageId })
  if (prepared?.ok !== true) return { ok: false, code: prepared?.code, message: prepared?.message }
  const { prompt, turn } = prepared.data
  prefillDraft(ctx, request.sessionId, prompt)
  return { ok: true, turn, reverted: prepared.data.reverted ?? [], conflicts: prepared.data.conflicts ?? [] }
}

/** The undo confirmation dialog hosted in shell.overlay. */
function UndoDialog(props) {
  const request = typeof props.useUndoRequest === 'function' ? props.useUndoRequest(state => state) : null
  const [phase, setPhase] = React.useState({ kind: 'idle' })
  React.useEffect(() => {
    if (request === null) setPhase({ kind: 'idle' })
  }, [request])
  const t2 = (key) => (typeof props.translate === 'function' ? props.translate(key) : key)
  const close = () => {
    if (phase.kind === 'working') return
    props.dismiss()
  }
  const confirm = async () => {
    if (request === null || phase.kind === 'working') return
    setPhase({ kind: 'working' })
    const result = await props.confirmUndo(request)
    setPhase(result?.ok === true
      ? { kind: 'done', turn: result.turn, reverted: result.reverted ?? [], conflicts: result.conflicts ?? [] }
      : { kind: 'error', code: result?.code, message: result?.message })
  }
  const footer = (() => {
    if (phase.kind === 'done') return React.createElement(Button, { variant: 'primary', className: 'su-btn-confirm', onClick: close }, t2('dialog.done'))
    return [
      React.createElement(Button, { key: 'cancel', variant: 'outline', className: 'su-btn-cancel', disabled: phase.kind === 'working', onClick: close }, t2('dialog.cancel')),
      React.createElement(Button, { key: 'confirm', variant: 'outline', className: 'su-delete su-btn-confirm', disabled: phase.kind === 'working', onClick: () => { void confirm() } },
        phase.kind === 'working' ? t2('dialog.working') : t2('dialog.confirm')),
    ]
  })()
  const children = []
  if (phase.kind === 'done') {
    children.push(React.createElement('div', { key: 'done-title', className: 'su-text', style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t2('dialog.doneTitle')))
    children.push(React.createElement('div', { key: 'done-desc', className: 'su-text' }, t2('dialog.doneDesc')))
    children.push(React.createElement('div', { key: 'done-reverted', className: 'su-text' },
      t2('dialog.doneReverted').replace('{n}', String((phase.reverted ?? []).length))))
    if ((phase.conflicts ?? []).length > 0) {
      children.push(React.createElement('div', { key: 'done-conflicts', className: 'su-error' },
        t2('dialog.doneConflicts').replace('{n}', String(phase.conflicts.length))))
    }
  } else {
    children.push(React.createElement('div', { key: 'warning', className: 'su-notice' }, t2('dialog.warning')))
    if (phase.kind === 'error') {
      const reasonKey = phase.code === undefined ? undefined : `reason.${String(phase.code)}`
      const localized = reasonKey === undefined ? undefined : t2(reasonKey)
      children.push(React.createElement('div', { key: 'error', className: 'su-error', role: 'alert' },
        localized === reasonKey || localized === undefined
          ? `${t2('dialog.failed')}${String(phase.message ?? phase.code ?? '')}`
          : localized))
    }
  }
  return React.createElement(Modal, {
    open: request !== null, onClose: close, closeLabel: t2('dialog.cancel'),
    title: t2('dialog.title'), className: 'su-dialog', contentClassName: 'su-content', footer,
  }, ...children)
}

function apply(ctx) {
  try {
    injectStyles()
    const t = ctx.locale.bind(NS)
    // Every language carries the English keys it does not translate, so `t`
    // never falls back to a raw key for a locale with a partial dictionary.
    for (const [locale, dict] of Object.entries(DICT)) {
      try {
        ctx.locale.register(NS, locale, { ...DICT.en, ...dict })
      } catch (error) {
        console.warn('session-delete: locale dictionary already registered', error)
      }
    }
    const request = createSource(null)
    const batchRequest = createSource(null)

    ctx.effect(() => ctx.contextMenus.register({
      id: 'sessionDelete.delete',
      target: 'session',
      order: MENU_ORDER,
      resolve: (target) => [{
        id: 'delete',
        label: t('menu.deleteSession'),
        icon: { key: 'workspace.delete' },
        danger: true,
        separatorBefore: true,
        // The built-in archive entry renders in the popup footer; joining that
        // group is what puts this entry directly below it.
        afterContent: true,
        failureLabel: t('failure.deleteSession'),
        run: () => {
          dialogRendered = false
          request.set({ sessionId: target.sessionId, displayTitle: target.displayTitle })
          if (!overlayReady) {
            showBanner('session-delete: the shell.overlay slot is unavailable, so the confirmation dialog could not open')
            return
          }
          setTimeout(() => {
            if (!dialogRendered) {
              showBanner('session-delete: the confirmation dialog did not render; the browser console holds the error')
              console.error('session-delete: dialog did not render for the requested session')
            }
          }, 700)
        },
      }],
    }), 'session-delete: context menu')

    // Workspace menu: batch cleanup sits above the built-in "delete workspace".
    ctx.effect(() => ctx.contextMenus.register({
      id: 'sessionDelete.batch',
      target: 'workspace',
      order: 200,
      resolve: (target) => [{
        id: 'batch',
        label: t('menu.batchCleanup'),
        icon: { key: 'workspace.delete' },
        run: () => { batchRequest.set({ workspaceId: target.workspaceId, displayTitle: target.displayTitle }) },
      }],
    }), 'session-delete: workspace batch menu')

    ctx.slots.inject('shell.overlay', () => {
      overlayReady = true
      return ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-delete.dialog',
        locale: NS,
        inject: () => ({
          hooks: { request },
          dismiss: () => { request.set(null) },
          refreshSessions: () => { void ctx.sessions.refresh() },
          translate: t,
        }),
      }, DeleteDialog)
    })

    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'session-delete.batch',
      locale: NS,
      inject: () => ({
        hooks: { batchRequest },
        dismiss: () => { batchRequest.set(null) },
        refreshSessions: () => { void ctx.sessions.refresh() },
        translate: t,
        titleOf: (id) => ctx.sessions.list.getSnapshot().byId[id]?.displayTitle ?? id,
      }),
    }, BatchDialog))

    // Turn undo: a second locale namespace, the message-strip icon, and a dialog.
    const tu = ctx.locale.bind(UNDO_NS)
    for (const [locale, dict] of Object.entries(UNDO_DICT)) {
      try { ctx.locale.register(UNDO_NS, locale, { ...UNDO_DICT.en, ...dict }) }
      catch (error) { console.warn('session-undo: locale already registered', error) }
    }
    const undoRequest = createSource(null)

    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'session-undo',
      order: 5,
      locale: UNDO_NS,
      inject: (sessionId) => ({
        undo: (messageId) => { undoRequest.set({ sessionId, messageId }) },
      }),
    }, UndoAction))

    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'session-undo.dialog',
      locale: UNDO_NS,
      inject: () => ({
        hooks: { undoRequest },
        dismiss: () => { undoRequest.set(null) },
        translate: tu,
        confirmUndo: (request) => runUndo(ctx, request),
      }),
    }, UndoDialog))
  } catch (error) {
    console.error('session-delete: client apply failed', error)
    showBanner(`session-delete 客户端加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

module.exports = { name: 'session-delete', inject: ['contextMenus', 'slots', 'locale', 'sessions', 'uiWorkspace', 'uiConversation'], apply }
return module.exports; } });