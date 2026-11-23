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
    'dialog.titleConfirm': '输入会话标题以确认删除：{title}',
    'dialog.worktreeStatus': '工作树回收状态：{status}（会话已删除，工作树可能稍后由官方清理）',
    'reason.title-required': '请输入正确的会话标题以确认删除',
    'reason.batch-title-required': '开启了标题确认，批量删除不可用；请逐个删除会话',
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
    'dialog.titleConfirm': 'Type the session title to confirm deletion: {title}',
    'dialog.worktreeStatus': 'Worktree reclaim status: {status} (session deleted; the worktree may be cleaned up later by the harness)',
    'reason.title-required': 'Enter the correct session title to confirm deletion',
    'reason.batch-title-required': 'Title confirmation is enabled; batch delete is unavailable. Delete sessions individually.',
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
.sd-title-input { display: block; width: 100%; margin: 6px 0 0; padding: 6px 8px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); border: 1px solid var(--dsw-alias-border-primary); border-radius: var(--dsw-radius-sm); box-sizing: border-box; }
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
.su-modes { display: flex; flex-direction: column; gap: 8px; }
.su-mode.su-mode { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; height: auto; padding: 10px 12px; text-align: left; }
.su-mode-title { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.su-mode-hint { font-size: 12px; line-height: 18px; font-weight: 400; color: var(--dsw-alias-label-caption); }
.su-files { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; max-height: min(280px, 40vh); overflow-y: auto; }
.su-file { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; }
.su-file-action { flex: none; min-width: 36px; color: var(--dsw-alias-label-caption); }
.su-file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-family: var(--dsh-font-mono, monospace); }
.su-file-conflict .su-file-action { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)); }
.su-file-conflict .su-file-path { text-decoration: line-through; opacity: 0.7; }
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
  const [confirmText, setConfirmText] = React.useState('')

  React.useEffect(() => {
    if (request === null) {
      setPhase({ kind: 'idle' })
      return undefined
    }
    let cancelled = false
    setConfirmText('')
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
      ...(phase.data?.requireTitleConfirmation === true ? { confirmTitle: confirmText } : {}),
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
  const needsTitle = data?.requireTitleConfirmation === true && String(data?.title ?? '').trim() !== ''
  const titleMatches = confirmText.trim() !== '' && confirmText.trim() === String(data?.title ?? '').trim()
  const canDelete = eligible && (!needsTitle || titleMatches)

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
    if (needsTitle) {
      children.push(React.createElement('div', { key: 'title-confirm-label', className: 'sd-hint' },
        t2('dialog.titleConfirm').replace('{title}', String(data?.title ?? ''))))
      children.push(React.createElement('input', {
        key: 'title-confirm-input', className: 'sd-title-input', type: 'text', value: confirmText,
        placeholder: String(data?.title ?? ''), autoComplete: 'off', spellCheck: false,
        onChange: (event) => { setConfirmText(event.target.value) },
      }))
    }
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
    const worktree = phase.data?.worktree
    if (worktree?.status && worktree.status !== 'absent' && worktree.status !== 'cleaned') {
      children.push(React.createElement('div', { key: 'done-worktree', className: 'sd-hint' },
        t2('dialog.worktreeStatus').replace('{status}', String(worktree.status))))
    }
    const warnings = phase.data?.warnings
    if (Array.isArray(warnings) && warnings.length > 0) {
      children.push(React.createElement('div', { key: 'done-warnings', className: 'sd-hint' }, warnings.join(' · ')))
    }
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
    'action.undo': '回退到此处',
    'dialog.title': '回退对话',
    'dialog.warning': '将在当前会话原地回退到这条消息之前：撤回这条消息及之后的对话，还原其间改过的文件（之后被改过的跳过、不动），并把这条消息的提示词放回输入框；不影响你最新的其他改动',
    'dialog.cancel': '取消',
    'dialog.confirm': '回退',
    'dialog.modeChat': '仅回退对话',
    'dialog.modeChatHint': '撤回这条消息及之后的对话，不改动文件',
    'dialog.modeBoth': '回退对话和文件',
    'dialog.modeBothHint': '撤回对话，并还原其间改过的文件',
    'dialog.steeringNote': '这是轮次中途的插话（steering），文件快照按整轮记录，无法精确对应到插话点。',
    'dialog.steeringBothDisabled': '插话目标仅支持回退对话，不还原文件',
    'dialog.filesTitle': '将还原以下文件（之后被改过的会跳过）',
    'dialog.filesEmpty': '没有该轮的文件快照，将仅回退对话',
    'dialog.loading': '正在加载文件清单…',
    'dialog.fileRestore': '还原',
    'dialog.fileRemove': '删除',
    'dialog.fileConflict': '跳过',
    'picker.search': '搜索要回退到的消息…',
    'picker.empty': '没有可回退的消息',
    'picker.noResults': '没有匹配的消息',
    'picker.noText': '（无文本）',
    'dialog.working': '正在回退…',
    'dialog.done': '完成',
    'dialog.doneTitle': '已回退',
    'dialog.doneDesc': '已回退，提示词已放回输入框',
    'dialog.prefillFailed': '提示词未能自动填入输入框，请手动输入',
    'dialog.failed': '回退失败：',
    'reason.session-busy': '该会话正在运行轮次且无法停止，请先停止再回退',
    'reason.no-prior-turn': '这是第一条消息，没有可回退的前序状态',
    'reason.not-on-surface': '该消息已不在模型上下文中（被压缩遮掉），无法回退到此处',
    'reason.not-a-user-message': '目标不是用户消息',
    'reason.subagent': '子代理会话不支持回退',
    'reason.not-live': '会话不可用，请先打开该会话',
    'reason.command-failed': '回退命令执行出错：',
    'reason.not-matched': '回退命令未执行：',
  },
  en: {
    'action.undo': 'Rewind to here',
    'dialog.title': 'Rewind conversation',
    'dialog.warning': 'Rewinds in place in the current session to before this message: withdraws this message and everything after it, reverts the files changed in between (later-modified files are skipped, untouched), and restores this message\'s prompt to the composer; your other latest changes are not affected',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'Rewind',
    'dialog.modeChat': 'Conversation only',
    'dialog.modeChatHint': 'Withdraw this message and everything after it; leave files unchanged',
    'dialog.modeBoth': 'Conversation and files',
    'dialog.modeBothHint': 'Withdraw the conversation and revert the files changed in between',
    'dialog.steeringNote': 'This is a mid-turn steering message; file snapshots are recorded per whole turn and cannot be matched to the steering point precisely.',
    'dialog.steeringBothDisabled': 'Steering targets support conversation-only rewind, not file restore',
    'dialog.filesTitle': 'These files will be reverted (later-modified ones are skipped)',
    'dialog.filesEmpty': 'No file snapshot for this turn; only the conversation will be rewound',
    'dialog.loading': 'Loading file list…',
    'dialog.fileRestore': 'restore',
    'dialog.fileRemove': 'remove',
    'dialog.fileConflict': 'skip',
    'picker.search': 'Search for the message to rewind to…',
    'picker.empty': 'No messages to rewind to',
    'picker.noResults': 'No matching messages',
    'picker.noText': '(no text)',
    'dialog.working': 'Rewinding…',
    'dialog.done': 'Done',
    'dialog.doneTitle': 'Rewound',
    'dialog.doneDesc': 'Rewound; the prompt is restored to the composer',
    'dialog.prefillFailed': 'The prompt could not be auto-filled into the composer; please type it manually',
    'dialog.failed': 'Rewind failed: ',
    'reason.session-busy': 'The session is running a turn and could not be stopped; stop it before rewinding',
    'reason.no-prior-turn': 'This is the first message; there is no prior state to rewind to',
    'reason.not-on-surface': 'This message is no longer in the model context (shadowed by compaction); cannot rewind to it',
    'reason.not-a-user-message': 'The target is not a user message',
    'reason.subagent': 'Subagent sessions cannot be rewound',
    'reason.not-live': 'The session is unavailable; open it first',
    'reason.command-failed': 'The rewind command errored: ',
    'reason.not-matched': 'The rewind command did not run: ',
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

/** Read a session's live chat snapshot, or undefined when unavailable. */
function chatSnapshotOf(ctx, sessionId) {
  try {
    return ctx.get('uiConversation')?.binding(sessionId)?.target('chat')?.getSnapshot()
  } catch {
    return undefined
  }
}

/** All materialized chat nodes (including hidden ones), tolerating older shapes. */
function chatNodesOf(chat) {
  if (chat === undefined || chat === null) return []
  if (typeof chat.nodes?.values === 'function') return [...chat.nodes.values()]
  return (chat.order ?? []).map(key => chat.nodes?.get(key)).filter(Boolean)
}

/** The newest /rewind command node's anchorSeq, or -1 when none. */
function latestRewindAnchor(chat) {
  let max = -1
  for (const node of chatNodesOf(chat)) {
    if (node.kind === 'command' && node.data?.name === 'rewind' && typeof node.anchorSeq === 'number') {
      if (node.anchorSeq > max) max = node.anchorSeq
    }
  }
  return max
}

/**
 * Wait for the just-executed /rewind command's settled outcome to appear in the
 * chat snapshot (a node newer than `beforeSeq` carrying an outcome). The command
 * result — not the `matched` admission flag — is the source of truth for success.
 * @returns the outcome {kind, text?, sourceEventSeq?}, or undefined on timeout.
 */
async function waitForRewindOutcome(ctx, sessionId, beforeSeq) {
  for (let attempt = 0; attempt < 40; attempt++) {
    let latest
    for (const node of chatNodesOf(chatSnapshotOf(ctx, sessionId))) {
      if (node.kind !== 'command' || node.data?.name !== 'rewind') continue
      if (typeof node.anchorSeq !== 'number' || node.anchorSeq <= beforeSeq) continue
      if (node.data.outcome === undefined || node.data.outcome === null) continue
      if (latest === undefined || node.anchorSeq > latest.anchorSeq) latest = node
    }
    if (latest !== undefined) return latest.data.outcome
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return undefined
}

/** Run the undo in place via the /rewind engine command, then refill the composer
 * with the withdrawn prompt. Same session, no fork (opencode-style). The request
 * is a user-message row {sessionId, seq, text}: seq is the target, text the prompt.
 * Success is judged by the command's settled outcome, not the `matched` flag. */
async function runUndo(ctx, request, mode) {
  const { sessionId, seq, text } = request
  const face = ctx.sessions.binding(sessionId)?.session
  if (face === undefined) return { ok: false, code: 'not-live', message: '会话不可用' }
  const beforeSeq = latestRewindAnchor(chatSnapshotOf(ctx, sessionId))
  let result
  try {
    result = await face.command(`/rewind @${seq} ${mode === 'chat' ? 'chat' : 'both'}`)
  } catch (error) {
    return { ok: false, code: 'command-failed', message: error instanceof Error ? error.message : String(error) }
  }
  if (result?.ok !== true) {
    return { ok: false, code: 'command-failed', message: result?.error?.message ?? '回退命令执行出错' }
  }
  const outcome = await waitForRewindOutcome(ctx, sessionId, beforeSeq)
  if (outcome === undefined) return { ok: false, code: 'no-outcome', message: '无法确认回退结果，请查看会话中的命令输出' }
  if (outcome.kind !== 'success') return { ok: false, code: 'rewind-error', message: outcome.text ?? '回退失败' }
  const prefillOk = await refillComposer(ctx, sessionId, text)
  return { ok: true, prefillOk, summary: outcome.text ?? '' }
}

/** The undo confirmation dialog hosted in shell.overlay. */
function UndoDialog(props) {
  const request = typeof props.useUndoRequest === 'function' ? props.useUndoRequest(state => state) : null
  const [phase, setPhase] = React.useState({ kind: 'select' })
  React.useEffect(() => {
    if (request === null) setPhase({ kind: 'select' })
  }, [request])
  const t2 = (key) => (typeof props.translate === 'function' ? props.translate(key) : key)
  const close = () => {
    if (phase.kind === 'working' || phase.kind === 'loading') return
    props.dismiss()
  }
  const execute = async (mode) => {
    if (request === null || phase.kind === 'working') return
    setPhase({ kind: 'working' })
    const result = await props.confirmUndo(request, mode)
    setPhase(result?.ok === true
      ? { kind: 'done', prefillOk: result.prefillOk === true, summary: result.summary ?? '' }
      : { kind: 'error', code: result?.code, message: result?.message })
  }
  const chooseFiles = async () => {
    if (request === null) return
    setPhase({ kind: 'loading' })
    let preview
    try { preview = await post('/session-undo/preview', { sessionId: request.sessionId, seq: request.seq }) } catch { preview = null }
    const ok = preview?.ok === true
    setPhase({ kind: 'files', files: ok ? preview.data.files : [], fileSnapshot: ok && preview.data.fileSnapshot === true })
  }

  const footer = (() => {
    if (phase.kind === 'done') {
      return React.createElement(Button, { variant: 'primary', className: 'su-btn-confirm', onClick: close }, t2('dialog.done'))
    }
    const busy = phase.kind === 'working' || phase.kind === 'loading'
    const cancel = React.createElement(Button, { key: 'cancel', variant: 'outline', className: 'su-btn-cancel', disabled: busy, onClick: close }, t2('dialog.cancel'))
    if (phase.kind === 'files') {
      return [cancel, React.createElement(Button, { key: 'confirm', variant: 'outline', className: 'su-delete su-btn-confirm', onClick: () => { void execute('both') } }, t2('dialog.confirm'))]
    }
    return [cancel]
  })()

  const children = []
  if (phase.kind === 'done') {
    children.push(React.createElement('div', { key: 'done-title', className: 'su-text', style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t2('dialog.doneTitle')))
    children.push(React.createElement('div', { key: 'done-desc', className: 'su-text' }, t2('dialog.doneDesc')))
    if (phase.summary) children.push(React.createElement('div', { key: 'done-summary', className: 'su-text' }, phase.summary))
    if (!phase.prefillOk) children.push(React.createElement('div', { key: 'done-prefill', className: 'su-error' }, t2('dialog.prefillFailed')))
  } else if (phase.kind === 'select') {
    const steering = request?.kind === 'steering'
    children.push(React.createElement('div', { key: 'warning', className: 'su-notice' }, t2('dialog.warning')))
    if (steering) children.push(React.createElement('div', { key: 'steering-note', className: 'su-text' }, t2('dialog.steeringNote')))
    children.push(React.createElement('div', { key: 'modes', className: 'su-modes' },
      React.createElement(Button, { variant: 'outline', className: 'su-mode', onClick: () => { void execute('chat') } },
        React.createElement('span', { className: 'su-mode-title' }, t2('dialog.modeChat')),
        React.createElement('span', { className: 'su-mode-hint' }, t2('dialog.modeChatHint'))),
      React.createElement(Button, { variant: 'outline', className: 'su-mode', disabled: steering, onClick: () => { void chooseFiles() } },
        React.createElement('span', { className: 'su-mode-title' }, t2('dialog.modeBoth')),
        React.createElement('span', { className: 'su-mode-hint' }, steering ? t2('dialog.steeringBothDisabled') : t2('dialog.modeBothHint')))))
  } else if (phase.kind === 'files') {
    if (!phase.fileSnapshot || phase.files.length === 0) {
      children.push(React.createElement('div', { key: 'files-empty', className: 'su-notice' }, t2('dialog.filesEmpty')))
    } else {
      children.push(React.createElement('div', { key: 'files-title', className: 'su-text', style: { fontWeight: 500 } }, t2('dialog.filesTitle')))
      children.push(React.createElement('div', { key: 'files-list', className: 'su-files' },
        phase.files.map((file, index) => React.createElement('div', { key: index, className: `su-file${file.conflict ? ' su-file-conflict' : ''}` },
          React.createElement('span', { className: 'su-file-action' }, file.conflict ? t2('dialog.fileConflict') : (file.action === 'remove' ? t2('dialog.fileRemove') : t2('dialog.fileRestore'))),
          React.createElement('span', { className: 'su-file-path', title: file.path }, file.path)))))
    }
  } else if (phase.kind === 'loading') {
    children.push(React.createElement('div', { key: 'loading', className: 'su-text' }, t2('dialog.loading')))
  } else {
    children.push(React.createElement('div', { key: 'warning', className: 'su-notice' }, t2('dialog.warning')))
    if (phase.kind === 'working') {
      children.push(React.createElement('div', { key: 'working', className: 'su-text' }, t2('dialog.working')))
    }
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

// === In-place rewind: chat-snapshot visibility wrapper (ported from dsh-rewind) ===
// DSH's surface replacement cuts only the model context; the rendered transcript
// keeps the shadowed rows. This wraps the registered `chat` view builder and marks
// nodes inside an executed rewind's [target, marker] span hidden. The seam is
// private (uiConversation.views / definition.create); its shape is checked and it
// is restored on unload, so a DSH change degrades gracefully instead of crashing.
const REWIND_COMMANDS = new Set(['rewind'])

function rewindTargetSeqOfArgs(args) {
  const match = /@(\d+)/.exec(typeof args === 'string' ? args : '')
  return match ? Number(match[1]) : undefined
}

function rewindCutsOf(nodes) {
  const cuts = []
  for (const node of nodes) {
    if (node.kind !== 'command') continue
    const command = node.data
    if (command?.name == null || !REWIND_COMMANDS.has(command.name)) continue
    const args = command.args ?? ''
    if (args.includes('preview') || args.includes('__candidates')) continue
    if (command.outcome?.kind !== 'success') continue
    const marker = command.outcome.sourceEventSeq
    if (marker === undefined) continue
    const target = rewindTargetSeqOfArgs(args)
    if (target === undefined || target > marker) continue
    cuts.push({ target, marker })
  }
  return cuts
}

function rewindHidden(node) {
  return node.visibility === 'hidden' ? node : { ...node, visibility: 'hidden' }
}
function rewindTurnOf(node) {
  const turn = node.location?.turn?.turn
  return typeof turn === 'number' ? turn : undefined
}
function rewindChanged(input) {
  return input.changedTurns === undefined ? {} : { changedTurns: input.changedTurns }
}

class RewindVisibilityBuilder {
  constructor(inner) {
    this.inner = inner
    this.originals = new Map()
    this.commands = new Map()
    this.byTurn = new Map()
    this.turnProcess = new Map()
    this.derived = new Map()
    this.cuts = []
    this.cutSignature = '[]'
    this.lastSignature = '[]'
  }
  get empty() { return this.inner.empty }
  replace(input) {
    try {
      this.setAll(input.nodes)
      this.lastSignature = this.cutSignature
      return this.inner.replace({ nodes: this.deriveAll(), timeline: input.timeline, ...rewindChanged(input) })
    } catch {
      // Degrade to the unmodified builder input rather than crash the chat view.
      return this.inner.replace({ nodes: input.nodes, timeline: input.timeline, ...rewindChanged(input) })
    }
  }
  apply(input) {
    try {
      return this.applyDerived(input)
    } catch {
      return this.inner.apply({ upserts: input.upserts, timeline: input.timeline, ...rewindChanged(input) })
    }
  }
  applyDerived(input) {
    const affected = new Set()
    let commandsChanged = false
    for (const node of input.upserts) {
      const previous = this.originals.get(node.key)
      const previousTurn = previous === undefined ? undefined : rewindTurnOf(previous)
      const nextTurn = rewindTurnOf(node)
      if (previousTurn !== undefined) affected.add(previousTurn)
      if (nextTurn !== undefined) affected.add(nextTurn)
      if (previous?.kind === 'command' || node.kind === 'command') commandsChanged = true
      this.setOriginal(node)
    }
    if (commandsChanged) this.refreshCuts()
    if (this.cutSignature !== this.lastSignature) {
      this.lastSignature = this.cutSignature
      return this.inner.replace({ nodes: this.deriveAll(), timeline: input.timeline, ...rewindChanged(input) })
    }
    const cuts = this.cuts
    const upserts = new Map()
    for (const node of input.upserts) upserts.set(node.key, this.deriveOne(node, cuts))
    for (const turn of affected) {
      const processKey = this.turnProcess.get(turn)
      const base = processKey === undefined ? undefined : this.originals.get(processKey)
      if (base === undefined) continue
      const next = this.deriveTurnProcess(base, cuts, turn, this.deriveOne(base, cuts))
      if (this.derived.get(processKey) !== next) upserts.set(processKey, next)
    }
    const list = [...upserts.values()]
    for (const node of list) this.derived.set(node.key, node)
    return this.inner.apply({ upserts: list, timeline: input.timeline, ...rewindChanged(input) })
  }
  groupInput() { return this.inner.groupInput?.() }
  publish() { this.inner.publish?.() }
  setAll(nodes) {
    this.originals.clear(); this.commands.clear(); this.byTurn.clear(); this.turnProcess.clear(); this.derived.clear()
    for (const node of nodes) this.setOriginal(node)
    this.refreshCuts()
  }
  setOriginal(node) {
    const previous = this.originals.get(node.key)
    if (previous !== undefined) this.unindex(previous)
    this.originals.set(node.key, node)
    if (node.kind === 'command') this.commands.set(node.key, node)
    const turn = rewindTurnOf(node)
    if (turn === undefined) return
    const members = this.byTurn.get(turn) ?? new Map()
    members.set(node.key, node)
    this.byTurn.set(turn, members)
    if (node.kind === 'turn-process') this.turnProcess.set(turn, node.key)
  }
  unindex(node) {
    if (node.kind === 'command') this.commands.delete(node.key)
    const turn = rewindTurnOf(node)
    if (turn === undefined) return
    const members = this.byTurn.get(turn)
    if (members === undefined) return
    members.delete(node.key)
    if (members.size === 0) this.byTurn.delete(turn)
    if (node.kind === 'turn-process' && this.turnProcess.get(turn) === node.key) {
      this.turnProcess.delete(turn)
      for (const member of members.values()) {
        if (member.kind === 'turn-process') { this.turnProcess.set(turn, member.key); break }
      }
    }
  }
  refreshCuts() {
    this.cuts = rewindCutsOf(this.commands.values())
    this.cutSignature = JSON.stringify(this.cuts.map(cut => `${cut.target}:${cut.marker}`).sort())
  }
  deriveAll() {
    const cuts = this.cuts
    const derived = new Map()
    for (const node of this.originals.values()) derived.set(node.key, this.deriveOne(node, cuts))
    for (const [turn, key] of this.turnProcess) {
      const base = this.originals.get(key)
      if (base === undefined) continue
      const current = derived.get(key) ?? this.deriveOne(base, cuts)
      derived.set(key, this.deriveTurnProcess(base, cuts, turn, current))
    }
    const result = [...derived.values()]
    this.derived = derived
    return result
  }
  deriveOne(node, cuts) {
    const base = this.originals.get(node.key) ?? node
    if (base.kind === 'command') {
      const command = base.data
      if (command?.name != null && REWIND_COMMANDS.has(command.name)) {
        const args = command.args ?? ''
        const probe = args.includes('preview') || args.includes('__candidates')
        const executed = command.outcome?.kind === 'success' && command.outcome.sourceEventSeq !== undefined
        if (probe || executed) return rewindHidden(base)
      }
      return base
    }
    const contained = cuts.some(cut => cut.target <= base.anchorSeq && base.anchorSeq <= cut.marker)
    return contained ? rewindHidden(base) : base
  }
  deriveTurnProcess(base, cuts, turn = rewindTurnOf(base), current = this.deriveOne(base, cuts)) {
    if (turn === undefined || current.visibility === 'hidden') return current
    const members = this.byTurn.get(turn)
    if (members === undefined) return current
    let count = 0
    let allHidden = true
    for (const member of members.values()) {
      if (member.key === base.key) continue
      count += 1
      if (this.deriveOne(member, cuts).visibility !== 'hidden') { allHidden = false; break }
    }
    if (count === 0) return current
    return allHidden ? rewindHidden(base) : current
  }
}

function installChatViewVisibility(ctx) {
  const patches = new Map()
  let currentCleanup
  const rebuildOpenSessions = (ui) => {
    const state = ctx.sessions?.list?.getSnapshot?.()
    if (state === undefined) return
    const ids = new Set([...(state.ids ?? []), ...Object.keys(state.byId ?? {})])
    for (const id of ids) {
      const retained = state.byId?.[id]?.retainedBy
      if (retained === undefined || !Object.values(retained).some(count => (count ?? 0) > 0)) continue
      try { ui.binding?.(id)?.rebuild?.() } catch { /* best-effort */ }
    }
  }
  const restorePatches = () => {
    for (const [definition, record] of patches) {
      if (definition.create === record.wrapper) definition.create = record.original
    }
    patches.clear()
  }
  const installOn = (ui) => {
    currentCleanup?.(); currentCleanup = undefined
    if (ui?.views === undefined) return
    const views = ui.views
    const ensure = () => {
      try {
        const definition = views.entries().find(candidate => candidate.target === 'chat')
        if (definition === undefined || typeof definition.create !== 'function') return
        const current = patches.get(definition)
        const create = definition.create
        if (current !== undefined && create === current.wrapper) return
        const wrapper = function wrappedChatBuilder() {
          const inner = create.call(definition)
          // Only wrap a builder whose protocol we understand; otherwise hand back
          // the original so a DSH builder change degrades instead of crashing.
          if (inner === null || typeof inner !== 'object' || typeof inner.replace !== 'function' || typeof inner.apply !== 'function') return inner
          return new RewindVisibilityBuilder(inner)
        }
        definition.create = wrapper
        patches.set(definition, { original: create, wrapper })
        rebuildOpenSessions(ui)
      } catch { /* shape mismatch: degrade gracefully, never crash */ }
    }
    let unsubscribe
    try { unsubscribe = views.subscribe?.(ensure) } catch { /* ignore */ }
    ensure()
    currentCleanup = () => { unsubscribe?.(); restorePatches(); rebuildOpenSessions(ui) }
  }
  const start = () => {
    let scope
    if (typeof ctx.inject === 'function') {
      scope = ctx.inject(['uiConversation'], (child) => installOn(child.get('uiConversation')))
    } else {
      installOn(ctx.get?.('uiConversation'))
    }
    return () => { currentCleanup?.(); currentCleanup = undefined; if (typeof scope === 'function') scope() }
  }
  if (typeof ctx.effect === 'function') ctx.effect(start, 'session-undo chat visibility')
  else start()
}

// === User-message ↶ mount (ported from dsh-rewind mount.tsx) ===
// Takes over the shipped user/steering row component in the conversation.chat.node
// slot and adds the rewind action to the row's actions row via extraActions. The
// row gives {sessionId, seq, text} directly (seq = target, text = prompt). Private
// seam: shape-checked, restores the original component identity on unload.
const CHAT_NODE_SLOT = 'conversation.chat.node'
const ROW_KEYS = new Set(['user', 'steering'])
const SHIPPED_ROW_PRIORITY = 0
const ROW_TICK_KEY = 'session-undo:mount'

function isClassComponent(fn) {
  const proto = fn?.prototype
  return proto != null && (proto.isReactComponent != null || typeof proto.render === 'function')
}

function rowRendererOf(component) {
  if (typeof component === 'function') return isClassComponent(component) ? undefined : component
  if (component === null || typeof component !== 'object') return undefined
  const type = component.type
  return typeof type === 'function' && !isClassComponent(type) ? type : undefined
}

function rowTargetOf(props) {
  const sessionId = props.sessionId
  const data = props.node?.data
  if (typeof sessionId !== 'string' || typeof data?.seq !== 'number' || typeof data?.time !== 'number') return undefined
  return { sessionId, seq: data.seq, time: data.time, kind: props.node?.kind }
}

function rowWithAction(official, render) {
  return function RowWithAction(props) {
    const composed = typeof props.renderSlotChain === 'function' ? props : { ...props, renderSlotChain: () => null }
    let row
    try {
      row = official(composed)
    } catch {
      // The official renderer threw (e.g. a DSH upgrade made it a class component):
      // render it the standard way rather than crashing the whole row.
      return React.createElement(official, composed)
    }
    const target = rowTargetOf(props)
    if (target === undefined || !React.isValidElement(row)) return row
    const actions = row.props.actions
    if (typeof actions !== 'function') return row
    const withAction = (text) => {
      const actionsRow = actions(text)
      if (!React.isValidElement(actionsRow)) return actionsRow
      try {
        const element = render({ ...target, text })
        if (element === null || element === undefined) return actionsRow
        const existing = actionsRow.props.extraActions
        return React.cloneElement(actionsRow, { extraActions: React.createElement(React.Fragment, null, existing, element) })
      } catch {
        return actionsRow
      }
    }
    return React.cloneElement(row, { actions: withAction })
  }
}

function installRowAction(slots, render) {
  if (typeof slots?.entries !== 'function') return () => {}
  const taken = new Map()
  const takeOver = (entry) => {
    if (taken.has(entry)) return false
    const official = rowRendererOf(entry.component)
    if (official === undefined) return false
    const replacement = rowWithAction(official, render)
    const original = entry.component
    try {
      entry.component = replacement
    } catch {
      return false // frozen entry / shape change: leave the row untouched
    }
    taken.set(entry, { original, replacement })
    return true
  }
  const tick = () => {
    if (typeof slots.register !== 'function') return
    try { slots.register({ name: CHAT_NODE_SLOT, key: ROW_TICK_KEY }, () => null)() } catch { /* ignore */ }
  }
  const sync = () => {
    try {
      let changed = false
      for (const entry of slots.entries(CHAT_NODE_SLOT)) {
        const key = entry.options?.key
        if (key === undefined || !ROW_KEYS.has(key)) continue
        if ((entry.options?.priority ?? SHIPPED_ROW_PRIORITY) !== SHIPPED_ROW_PRIORITY) continue
        changed = takeOver(entry) || changed
      }
      if (changed) tick()
    } catch { /* slot shape change: degrade to no ↶, never throw into apply */ }
  }
  sync()
  let unsubscribe
  try { unsubscribe = slots.subscribe?.(CHAT_NODE_SLOT, sync) } catch { /* ignore */ }
  return () => {
    try { unsubscribe?.() } catch { /* ignore */ }
    for (const [entry, record] of taken) {
      try { if (entry.component === record.replacement) entry.component = record.original } catch { /* ignore */ }
    }
    taken.clear()
    tick() // nudge a re-render so restored rows drop the ↶ promptly
  }
}

/** The ↶ action rendered inside a user/steering message's actions row. */
function UserRewindAction(props) {
  const { row, onUndo, label } = props
  return React.createElement('button', {
    type: 'button',
    className: 'su-action',
    title: label,
    'aria-label': label,
    onClick: (event) => { event.stopPropagation(); onUndo(row) },
  }, React.createElement(UndoIcon))
}

/** Restore the withdrawn prompt to the composer (facade setDraft, then DOM fallback). */
function refillComposer(ctx, sessionId, text) {
  return new Promise((resolve) => {
    if (!text) { resolve(false); return }
    let tries = 0
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const write = () => {
      const actx = ctx.sessions.scope?.(sessionId)
      if (actx !== undefined) {
        try { ctx.get('uiConversation')?.input.for(actx).setDraft(text); return true } catch { /* fall through to DOM */ }
      }
      const editable = document.querySelector('[data-composer-input]')
      if (editable === null) return false
      editable.focus()
      const selection = document.getSelection()
      if (selection !== null) {
        const range = document.createRange()
        range.selectNodeContents(editable)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      try { if (document.execCommand('insertText', false, text)) return true } catch { /* fall through */ }
      editable.textContent = text
      editable.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    const attempt = () => {
      if (write()) { setTimeout(() => { write(); finish(true) }, 400); return }
      if (tries++ < 50) setTimeout(attempt, 100)
      else finish(false)
    }
    attempt()
  })
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

    // ↶ on each user/steering message row (opencode-style). The row supplies the
    // target seq and prompt text directly; clicking opens the confirm dialog.
    ctx.effect(() => installRowAction(ctx.slots, (row) => React.createElement(UserRewindAction, {
      row,
      onUndo: (selected) => { undoRequest.set(selected) },
      label: tu('action.undo'),
    })), 'session-undo user-row action')

    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'session-undo.dialog',
      locale: UNDO_NS,
      inject: () => ({
        hooks: { undoRequest },
        dismiss: () => { undoRequest.set(null) },
        translate: tu,
        confirmUndo: (request, mode) => runUndo(ctx, request, mode),
      }),
    }, UndoDialog))

    // Hide withdrawn transcript rows for executed rewinds (private chat-builder
    // seam; shape-checked and restored on unload, degrades gracefully).
    installChatViewVisibility(ctx)

    // Bare /rewind opens the harness popupSelect candidate picker (native ↑↓/
    // Enter/Esc keyboard navigation). Picking a candidate opens the mode dialog.
    const commandUi = ctx.get('commandUi')
    if (commandUi !== undefined && typeof commandUi.decorate === 'function') {
      const candidatesCache = new Map()
      const fetchCandidates = async (sessionId) => {
        try {
          const res = await post('/session-undo/candidates', { sessionId })
          return res?.ok === true ? res.data.candidates : []
        } catch { return [] }
      }
      const clock = (time) => {
        const d = new Date(time)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      ctx.effect(() => commandUi.decorate({
        name: 'rewind',
        available: (session) => {
          const face = ctx.sessions.binding(session.sessionId)?.session
          return face !== undefined && face.getSnapshot().subagent == null
        },
        ui: {
          kind: 'popupSelect',
          searchLabels: () => ({ placeholder: tu('picker.search'), empty: tu('picker.empty'), noResults: tu('picker.noResults') }),
          options: async (session) => {
            const candidates = await fetchCandidates(session.sessionId)
            candidatesCache.set(session.sessionId, candidates)
            return candidates.map(candidate => ({
              id: String(candidate.seq),
              label: candidate.preview || tu('picker.noText'),
              detail: clock(candidate.time),
            }))
          },
          onSelect: (option, session) => {
            const candidate = (candidatesCache.get(session.sessionId) ?? []).find(item => String(item.seq) === option.id)
            if (candidate === undefined) return
            undoRequest.set({ sessionId: session.sessionId, seq: candidate.seq, text: candidate.text })
          },
        },
      }), 'session-undo /rewind decoration')
    }
  } catch (error) {
    console.error('session-delete: client apply failed', error)
    showBanner(`session-delete 客户端加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

module.exports = { name: 'session-delete', inject: ['contextMenus', 'slots', 'locale', 'sessions'], apply, __rewindTest: { rewindCutsOf, rewindTargetSeqOfArgs, RewindVisibilityBuilder, runUndo, latestRewindAnchor, chatNodesOf, isClassComponent, rowRendererOf } }
return module.exports; } });