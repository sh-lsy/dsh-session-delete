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
.sd-dialog { width: min(420px, 100%); }
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

const { Modal = FallbackModal, Button = FallbackButton } = primitiveModule

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
      React.createElement(Button, { key: 'cancel', variant: 'outline', disabled: phase.kind === 'working', onClick: close }, t2('dialog.cancel')),
      React.createElement(Button, {
        key: 'delete', variant: 'outline', className: 'sd-delete',
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
    footer,
  }, ...children)
}

/** Plugin `apply`: stylesheet, dictionaries, the context-menu entry, and the overlay dialog. */
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
  } catch (error) {
    console.error('session-delete: client apply failed', error)
    showBanner(`session-delete 客户端加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

module.exports = { name: 'session-delete', inject: ['contextMenus', 'slots', 'locale', 'sessions'], apply }
return module.exports; } });