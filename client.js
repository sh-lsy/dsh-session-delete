window.__ModuleLoader__.load({
  id: '@sh-lsy/dsh-session-delete',
  factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/**
 * Web half of `@sh-lsy/dsh-session-delete`.
 *
 * Adds a red "Delete session" entry directly below the built-in archive entry
 * and drives two owner-only Host routes. Nothing here deletes anything on its
 * own: the Host owns every guard, and this half only presents the inventory,
 * collects the typed confirmation, and refreshes the sidebar list afterwards.
 */
const React = require('react')

// The design-system primitives are a shell baseline module. A plugin bundle is
// loaded through the module table, whose interop shape is not something this
// package can assume, so a missing export degrades to a self-contained overlay
// instead of an undefined component that renders nothing.
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

/** Minimal modal used when the design-system primitives are unavailable. */
function FallbackModal(props) {
  if (props.open !== true) return null
  const { children, footer, title, onClose, closeLabel } = props
  const items = Array.isArray(children) ? children : [children]
  return React.createElement('div', {
    role: 'presentation',
    style: { position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' },
    onClick: onClose,
  }, React.createElement('div', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': typeof title === 'string' ? title : undefined,
    style: { width: 'min(560px, 92vw)', maxHeight: '86vh', overflow: 'auto', padding: '18px 20px', borderRadius: '14px', background: 'var(--dsw-alias-bg-elevated, #1c1c1e)', color: 'var(--dsw-alias-label-primary, #eee)', boxShadow: '0 18px 60px rgba(0,0,0,.45)', fontSize: '13px' },
    onClick: event => event.stopPropagation(),
  },
  React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' } },
    React.createElement('strong', { style: { fontSize: '15px' } }, title),
    React.createElement('button', {
      type: 'button', 'aria-label': closeLabel, onClick: onClose,
      style: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' },
    }, '×')),
  ...items,
  footer === undefined ? null : React.createElement('div', { style: { marginTop: '14px' } }, footer)))
}

/** Minimal button used with {@link FallbackModal}. */
function FallbackButton(props) {
  const { children, onClick, disabled } = props
  return React.createElement('button', {
    type: 'button', onClick, disabled,
    style: { padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-secondary, #3a3a3c)', background: 'transparent', color: 'inherit', cursor: disabled === true ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: disabled === true ? .5 : 1 },
  }, children)
}

const { Modal = FallbackModal, Button = FallbackButton } = primitiveModule

const DICT = {
  zh: {
    'menu.deleteSession': '删除会话',
    'dialog.title': '永久删除会话',
    'dialog.warning': '⚠ 此操作不可恢复。会话记录与下列产物将从磁盘删除，没有回收站。',
    'dialog.identity': '会话',
    'dialog.lastActive': '最后活动',
    'dialog.size': '占用大小',
    'dialog.threshold': '删除阈值',
    'dialog.willDelete': '将被永久删除：',
    'dialog.item.log': '会话日志（全部历史世代与压缩副本）',
    'dialog.item.cache': '投影缓存记录',
    'dialog.item.spill': '工具输出的大文件缓存（spill）',
    'dialog.item.worktree': '工作树（仅在无未提交改动且无其他会话引用时删除，分支保留）',
    'dialog.item.account': '工作区归属、置顶与归档记录',
    'dialog.item.plan': '指向该会话的定时任务（删除前会先停止）',
    'dialog.willKeep': '不会被删除：共享附件、工作区目录与其他会话。',
    'dialog.worktreeYes': '检测到工作树：',
    'dialog.worktreeNo': '未检测到工作树。',
    'dialog.children': '该会话有 {n} 个分叉子会话，删除后其谱系将显示为断开。',
    'dialog.confirmLabel': '请输入会话标题以确认',
    'dialog.confirmHint': '输入完全一致后“删除”按钮才会启用',
    'dialog.fill': '填入标题',
    'dialog.blocked': '当前不允许删除',
    'dialog.reasonPrefix': '原因：',
    'dialog.cancel': '取消',
    'dialog.delete': '删除',
    'dialog.deleting': '正在删除…',
    'dialog.doneClose': '完成',
    'dialog.needsStopTitle': '该会话仍有计划中的工作',
    'dialog.needsStopDesc': '以下工作会先被停止，否则日后唤醒会重建已删除的会话：',
    'dialog.stopAndDelete': '停止并删除',
    'dialog.success': '会话已永久删除。',
    'dialog.successSize': '已释放 {size}。',
    'dialog.successWorktree': '工作树：{status}',
    'dialog.mismatch': '输入的标题与会话标题不一致。',
    'dialog.loading': '正在检查…',
    'failure.deleteSession': '删除会话失败',
    'reason.session-live': '该会话在本次运行中打开过。请重启 DeepSeek Harness 后再删除。',
    'reason.migration-required': '该会话的日志是旧格式，请先打开一次完成迁移，然后再删除。',
    'reason.unsupported-backend': '仅支持官方默认的 JSONL 持久化后端。',
    'reason.too-recent': '该会话距最后活动不足阈值天数。',
    'reason.not-found': '该会话不存在，可能已被删除。',
    'reason.delete-failed': '删除失败：',
    'reason.network': '与后台的通信失败。',
  },
  en: {
    'menu.deleteSession': 'Delete session',
    'dialog.title': 'Permanently delete session',
    'dialog.warning': '⚠ This cannot be undone. The session record and the artifacts below are removed from disk; there is no trash.',
    'dialog.identity': 'Session',
    'dialog.lastActive': 'Last activity',
    'dialog.size': 'On disk',
    'dialog.threshold': 'Threshold',
    'dialog.willDelete': 'Permanently deleted:',
    'dialog.item.log': 'Session log (every generation and compressed copy)',
    'dialog.item.cache': 'Projection cache record',
    'dialog.item.spill': 'Large tool-output spill files',
    'dialog.item.worktree': 'Worktree (only when clean and unreferenced; the branch is kept)',
    'dialog.item.account': 'Workspace membership, pin, and archive entries',
    'dialog.item.plan': 'Scheduled tasks targeting it (stopped before deletion)',
    'dialog.willKeep': 'Kept: shared attachments, workspace directories, and other sessions.',
    'dialog.worktreeYes': 'Worktree detected: ',
    'dialog.worktreeNo': 'No worktree detected.',
    'dialog.children': '{n} forked child session(s) will show a broken lineage.',
    'dialog.confirmLabel': 'Type the session title to confirm',
    'dialog.confirmHint': 'Delete stays disabled until the title matches exactly',
    'dialog.fill': 'Fill title',
    'dialog.blocked': 'Deletion is not allowed',
    'dialog.reasonPrefix': 'Reason: ',
    'dialog.cancel': 'Cancel',
    'dialog.delete': 'Delete',
    'dialog.deleting': 'Deleting…',
    'dialog.doneClose': 'Done',
    'dialog.needsStopTitle': 'This session still has planned work',
    'dialog.needsStopDesc': 'This work is stopped first; otherwise a later wake would recreate the deleted session:',
    'dialog.stopAndDelete': 'Stop and delete',
    'dialog.success': 'Session permanently deleted.',
    'dialog.successSize': 'Freed {size}.',
    'dialog.successWorktree': 'Worktree: {status}',
    'dialog.mismatch': 'The typed title does not match the session title.',
    'dialog.loading': 'Checking…',
    'failure.deleteSession': 'Session deletion failed',
    'reason.session-live': 'This session was opened during this run. Restart DeepSeek Harness, then delete it.',
    'reason.migration-required': 'This session log uses an older format. Open it once to migrate, then delete it.',
    'reason.unsupported-backend': 'Only the shipped JSONL persistence backend is supported.',
    'reason.too-recent': 'This session is newer than the configured threshold.',
    'reason.not-found': 'This session does not exist; it may already be deleted.',
    'reason.delete-failed': 'Deletion failed: ',
    'reason.network': 'Communication with the Host failed.',
  },
  ja: {
    'menu.deleteSession': 'セッションを削除',
    'dialog.title': 'セッションを完全に削除',
    'dialog.warning': '⚠ 元に戻せません。セッション記録と以下の成果物がディスクから削除され、ゴミ箱には入りません。',
    'dialog.willDelete': '完全に削除されます：',
    'dialog.item.log': 'セッションログ（全世代と圧縮コピー）',
    'dialog.item.cache': 'プロジェクションキャッシュ',
    'dialog.item.spill': '大きなツール出力の退避ファイル',
    'dialog.item.worktree': 'ワークツリー（未コミット変更がなく未参照の場合のみ。ブランチは保持）',
    'dialog.item.account': 'ワークスペース所属・ピン・アーカイブ記録',
    'dialog.item.plan': 'このセッションを対象とする定期タスク（削除前に停止）',
    'dialog.willKeep': '削除しません：共有添付ファイル、ワークスペースのディレクトリ、他のセッション。',
    'dialog.cancel': 'キャンセル',
    'dialog.delete': '削除',
    'dialog.deleting': '削除中…',
    'dialog.fill': 'タイトルを入力',
    'dialog.blocked': '削除できません',
    'dialog.reasonPrefix': '理由：',
    'dialog.success': 'セッションを完全に削除しました。',
    'dialog.doneClose': '完了',
    'dialog.stopAndDelete': '停止して削除',
    'dialog.needsStopTitle': 'このセッションには予定された作業があります',
    'dialog.needsStopDesc': '先に以下の作業を停止します（停止しないと後で再作成されます）：',
    'dialog.confirmLabel': '確認のためタイトルを入力してください',
  },
  es: {
    'menu.deleteSession': 'Eliminar sesión',
    'dialog.title': 'Eliminar la sesión de forma permanente',
    'dialog.warning': '⚠ No se puede deshacer. El registro y los artefactos siguientes se borran del disco; no hay papelera.',
    'dialog.willDelete': 'Se eliminará de forma permanente:',
    'dialog.item.log': 'Registro de la sesión (todas las generaciones y copias comprimidas)',
    'dialog.item.cache': 'Registro de caché de proyecciones',
    'dialog.item.spill': 'Archivos de salida grandes de herramientas',
    'dialog.item.worktree': 'Árbol de trabajo (solo si está limpio y sin referencias; la rama se conserva)',
    'dialog.item.account': 'Pertenencia al espacio de trabajo, fijado y archivo',
    'dialog.item.plan': 'Tareas programadas dirigidas a ella (se detienen antes)',
    'dialog.willKeep': 'No se elimina: adjuntos compartidos, directorios del espacio de trabajo ni otras sesiones.',
    'dialog.cancel': 'Cancelar',
    'dialog.delete': 'Eliminar',
    'dialog.deleting': 'Eliminando…',
    'dialog.fill': 'Rellenar título',
    'dialog.blocked': 'No se permite eliminar',
    'dialog.reasonPrefix': 'Motivo: ',
    'dialog.success': 'Sesión eliminada de forma permanente.',
    'dialog.doneClose': 'Hecho',
    'dialog.stopAndDelete': 'Detener y eliminar',
    'dialog.needsStopTitle': 'Esta sesión aún tiene trabajo planificado',
    'dialog.needsStopDesc': 'Primero se detiene este trabajo; de lo contrario, un despertar posterior recrearía la sesión:',
    'dialog.confirmLabel': 'Escribe el título para confirmar',
  },
  fr: {
    'menu.deleteSession': 'Supprimer la session',
    'dialog.title': 'Supprimer définitivement la session',
    'dialog.warning': "⚠ Action irréversible. L'enregistrement et les artefacts ci-dessous sont effacés du disque ; aucune corbeille.",
    'dialog.willDelete': 'Supprimés définitivement :',
    'dialog.item.log': 'Journal de session (toutes les générations et copies compressées)',
    'dialog.item.cache': 'Enregistrement du cache de projections',
    'dialog.item.spill': 'Fichiers de sortie volumineux des outils',
    'dialog.item.worktree': "Arbre de travail (seulement s'il est propre et non référencé ; la branche est conservée)",
    'dialog.item.account': "Appartenance à l'espace de travail, épinglage et archive",
    'dialog.item.plan': 'Tâches planifiées qui la ciblent (arrêtées avant)',
    'dialog.willKeep': "Conservés : pièces jointes partagées, répertoires de l'espace de travail et autres sessions.",
    'dialog.cancel': 'Annuler',
    'dialog.delete': 'Supprimer',
    'dialog.deleting': 'Suppression…',
    'dialog.fill': 'Remplir le titre',
    'dialog.blocked': 'Suppression impossible',
    'dialog.reasonPrefix': 'Raison : ',
    'dialog.success': 'Session supprimée définitivement.',
    'dialog.doneClose': 'Terminé',
    'dialog.stopAndDelete': 'Arrêter et supprimer',
    'dialog.needsStopTitle': 'Cette session a encore du travail planifié',
    'dialog.needsStopDesc': "Ce travail est d'abord arrêté ; sinon un réveil ultérieur recréerait la session :",
    'dialog.confirmLabel': 'Saisissez le titre pour confirmer',
  },
  de: {
    'menu.deleteSession': 'Sitzung löschen',
    'dialog.title': 'Sitzung endgültig löschen',
    'dialog.warning': '⚠ Nicht umkehrbar. Sitzungsprotokoll und die folgenden Artefakte werden von der Platte gelöscht; kein Papierkorb.',
    'dialog.willDelete': 'Endgültig gelöscht:',
    'dialog.item.log': 'Sitzungsprotokoll (alle Generationen und komprimierte Kopien)',
    'dialog.item.cache': 'Projektions-Cache-Eintrag',
    'dialog.item.spill': 'Große Werkzeug-Auslagerungsdateien',
    'dialog.item.worktree': 'Arbeitsbaum (nur wenn sauber und unreferenziert; der Branch bleibt)',
    'dialog.item.account': 'Workspace-Zuordnung, Anheftung und Archiv',
    'dialog.item.plan': 'Geplante Aufgaben darauf (vorher gestoppt)',
    'dialog.willKeep': 'Bleibt: geteilte Anhänge, Workspace-Verzeichnisse und andere Sitzungen.',
    'dialog.cancel': 'Abbrechen',
    'dialog.delete': 'Löschen',
    'dialog.deleting': 'Wird gelöscht…',
    'dialog.fill': 'Titel einsetzen',
    'dialog.blocked': 'Löschen nicht erlaubt',
    'dialog.reasonPrefix': 'Grund: ',
    'dialog.success': 'Sitzung endgültig gelöscht.',
    'dialog.doneClose': 'Fertig',
    'dialog.stopAndDelete': 'Stoppen und löschen',
    'dialog.needsStopTitle': 'Diese Sitzung hat noch geplante Arbeit',
    'dialog.needsStopDesc': 'Diese Arbeit wird zuerst gestoppt; sonst würde ein späteres Aufwachen die Sitzung neu anlegen:',
    'dialog.confirmLabel': 'Titel zur Bestätigung eingeben',
  },
  ru: {
    'menu.deleteSession': 'Удалить сеанс',
    'dialog.title': 'Удалить сеанс безвозвратно',
    'dialog.warning': '⚠ Отменить нельзя. Запись сеанса и перечисленные артефакты удаляются с диска; корзины нет.',
    'dialog.willDelete': 'Будет удалено безвозвратно:',
    'dialog.item.log': 'Журнал сеанса (все поколения и сжатые копии)',
    'dialog.item.cache': 'Запись кэша проекций',
    'dialog.item.spill': 'Крупные файлы вывода инструментов',
    'dialog.item.worktree': 'Рабочее дерево (только если чисто и без ссылок; ветка сохраняется)',
    'dialog.item.account': 'Привязка к рабочему пространству, закрепление и архив',
    'dialog.item.plan': 'Запланированные задачи на него (сначала останавливаются)',
    'dialog.willKeep': 'Не удаляется: общие вложения, каталоги рабочего пространства и другие сеансы.',
    'dialog.cancel': 'Отмена',
    'dialog.delete': 'Удалить',
    'dialog.deleting': 'Удаление…',
    'dialog.fill': 'Подставить заголовок',
    'dialog.blocked': 'Удаление запрещено',
    'dialog.reasonPrefix': 'Причина: ',
    'dialog.success': 'Сеанс удалён безвозвратно.',
    'dialog.doneClose': 'Готово',
    'dialog.stopAndDelete': 'Остановить и удалить',
    'dialog.needsStopTitle': 'У сеанса ещё есть запланированная работа',
    'dialog.needsStopDesc': 'Сначала эта работа останавливается; иначе позднее пробуждение создаст сеанс заново:',
    'dialog.confirmLabel': 'Введите заголовок для подтверждения',
  },
  pt: {
    'menu.deleteSession': 'Excluir sessão',
    'dialog.title': 'Excluir sessão permanentemente',
    'dialog.warning': '⚠ Não pode ser desfeito. O registro e os artefatos abaixo são removidos do disco; não há lixeira.',
    'dialog.willDelete': 'Excluído permanentemente:',
    'dialog.item.log': 'Log da sessão (todas as gerações e cópias compactadas)',
    'dialog.item.cache': 'Registro de cache de projeções',
    'dialog.item.spill': 'Arquivos grandes de saída de ferramentas',
    'dialog.item.worktree': 'Árvore de trabalho (somente se limpa e sem referências; o branch é mantido)',
    'dialog.item.account': 'Vínculo ao workspace, fixação e arquivo',
    'dialog.item.plan': 'Tarefas agendadas para ela (paradas antes)',
    'dialog.willKeep': 'Mantidos: anexos compartilhados, diretórios do workspace e outras sessões.',
    'dialog.cancel': 'Cancelar',
    'dialog.delete': 'Excluir',
    'dialog.deleting': 'Excluindo…',
    'dialog.fill': 'Preencher título',
    'dialog.blocked': 'Exclusão não permitida',
    'dialog.reasonPrefix': 'Motivo: ',
    'dialog.success': 'Sessão excluída permanentemente.',
    'dialog.doneClose': 'Concluído',
    'dialog.stopAndDelete': 'Parar e excluir',
    'dialog.needsStopTitle': 'Esta sessão ainda tem trabalho planejado',
    'dialog.needsStopDesc': 'Esse trabalho é parado primeiro; caso contrário um despertar posterior recriaria a sessão:',
    'dialog.confirmLabel': 'Digite o título para confirmar',
  },
}

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

const styles = {
  warning: {
    display: 'flex',
    gap: '8px',
    padding: '10px 12px',
    margin: '0 0 12px',
    borderRadius: '8px',
    color: 'var(--dsw-alias-state-error-primary)',
    background: 'var(--dsw-alias-interactive-bg-hover-danger)',
    fontSize: '13px',
    lineHeight: '20px',
    fontWeight: 600,
  },
  meta: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '0 0 12px', fontSize: '12px', lineHeight: '20px' },
  metaKey: { color: 'var(--dsw-alias-label-secondary)' },
  list: { margin: '0 0 10px', padding: '0 0 0 18px', fontSize: '12px', lineHeight: '20px' },
  keep: { margin: '0 0 12px', fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
  notice: { margin: '0 0 10px', fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-state-error-primary)' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-secondary)', background: 'var(--dsw-alias-bg-secondary)', color: 'var(--dsw-alias-label-primary)', fontSize: '13px' },
  hint: { margin: '6px 0 0', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
  row: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' },
  items: { margin: '0 0 10px', fontSize: '12px', lineHeight: '20px' },
}

/** The confirmation dialog; it owns the request lifecycle for one session at a time. */
function DeleteDialog(props) {
  const request = typeof props.useRequest === 'function' ? props.useRequest() : null
  if (request !== null) dialogRendered = true
  const [phase, setPhase] = React.useState({ kind: 'idle' })
  const [typed, setTyped] = React.useState('')

  React.useEffect(() => {
    if (request === null) {
      setPhase({ kind: 'idle' })
      setTyped('')
      return undefined
    }
    let cancelled = false
    setTyped('')
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

  const close = () => {
    if (phase.kind === 'working') return
    props.dismiss()
  }

  const run = async (stopActivity) => {
    if (request === null || phase.kind === 'working') return
    setPhase({ kind: 'working', data: phase.data ?? null })
    const body = await post(DELETE_PATH, {
      sessionId: request.sessionId,
      confirmTitle: typed,
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

  const t2 = (key) => (typeof props.translate === 'function' ? props.translate(key) : key)

  const title = request?.displayTitle ?? ''
  const matches = typed.trim() !== '' && typed === title
  const data = phase.data ?? null
  const eligible = phase.kind === 'ready' && data?.eligible === true
  const confirmRequired = data?.requireTitleConfirmation !== false
  const canDelete = eligible && (!confirmRequired || matches)

  const footer = (() => {
    if (phase.kind === 'done') {
      return React.createElement(Button, { variant: 'primary', onClick: close }, t2('dialog.doneClose'))
    }
    if (phase.kind === 'needs-stop') {
      return React.createElement('div', { style: styles.row },
        React.createElement(Button, { variant: 'outline', onClick: close }, t2('dialog.cancel')),
        React.createElement(Button, { variant: 'outline', onClick: () => { void run(true) } }, t2('dialog.stopAndDelete')),
      )
    }
    return React.createElement('div', { style: styles.row },
      React.createElement(Button, { variant: 'outline', disabled: phase.kind === 'working', onClick: close }, t2('dialog.cancel')),
      React.createElement(Button, {
        variant: 'outline',
        disabled: !canDelete || phase.kind === 'working',
        onClick: () => { void run(false) },
      }, phase.kind === 'working' ? t2('dialog.deleting') : t2('dialog.delete')),
    )
  })()

  const children = []
  if (phase.kind === 'loading') children.push(React.createElement('div', { key: 'loading', style: styles.hint }, t2('dialog.loading')))
  if (phase.kind === 'ready' || phase.kind === 'working' || phase.kind === 'error') {
    if (data !== null) {
      children.push(React.createElement('div', { key: 'warning', style: styles.warning }, t2('dialog.warning')))
      children.push(React.createElement('div', { key: 'meta', style: styles.meta },
        React.createElement('span', { style: styles.metaKey }, t2('dialog.identity')),
        React.createElement('span', null, `${title}  (${request?.sessionId ?? ''})`),
        React.createElement('span', { style: styles.metaKey }, t2('dialog.lastActive')),
        React.createElement('span', null, formatTime(data.lastActivity)),
        React.createElement('span', { style: styles.metaKey }, t2('dialog.size')),
        React.createElement('span', null, formatSize(data.sizeBytes)),
        React.createElement('span', { style: styles.metaKey }, t2('dialog.threshold')),
        React.createElement('span', null, `${String(data.minAgeDays)} day(s)`),
      ))
      children.push(React.createElement('div', { key: 'delete-head', style: styles.items }, t2('dialog.willDelete')))
      children.push(React.createElement('ul', { key: 'delete-list', style: styles.list },
        ['dialog.item.log', 'dialog.item.cache', 'dialog.item.spill', 'dialog.item.worktree', 'dialog.item.account', 'dialog.item.plan']
          .map(key => React.createElement('li', { key }, t2(key))),
      ))
      children.push(React.createElement('div', { key: 'keep', style: styles.keep }, t2('dialog.willKeep')))
      children.push(React.createElement('div', { key: 'worktree', style: styles.hint },
        data.worktree === null || data.worktree === undefined
          ? t2('dialog.worktreeNo')
          : `${t2('dialog.worktreeYes')}${String(data.worktree.path)} → ${String(data.worktree.branch ?? '')}`,
      ))
      if (typeof data.childSessions === 'number' && data.childSessions > 0) {
        children.push(React.createElement('div', { key: 'children', style: styles.notice },
          t2('dialog.children').replace('{n}', String(data.childSessions))))
      }
      if (data.eligible !== true) {
        const reason = Array.isArray(data.reasons) && data.reasons.length > 0 ? data.reasons[0] : null
        // Unshifted so the refusal sits above the inventory: a blocked session
        // must not read as a silent no-op.
        children.unshift(React.createElement('div', { key: 'blocked', style: styles.warning },
          `${t2('dialog.blocked')} — ${t2('dialog.reasonPrefix')}${reason === null ? '' : t2(`reason.${reason.code}`)}`))
      }
      if (data.eligible === true && confirmRequired) {
        children.push(React.createElement('div', { key: 'confirm' },
          React.createElement('div', { style: styles.items }, t2('dialog.confirmLabel')),
          React.createElement('input', {
            style: styles.input,
            value: typed,
            onChange: event => { setTyped(event.target.value) },
            'aria-label': t2('dialog.confirmLabel'),
          }),
          React.createElement('div', { style: styles.hint },
            React.createElement('button', {
              type: 'button',
              style: { background: 'none', border: 'none', padding: 0, color: 'var(--dsw-alias-brand-primary, #4d6bfe)', cursor: 'pointer', fontSize: '12px' },
              onClick: () => { setTyped(title) },
            }, t2('dialog.fill')),
            ` · ${t2('dialog.confirmHint')}`,
          ),
        ))
      }
    }
  }
  if (phase.kind === 'needs-stop') {
    children.push(React.createElement('div', { key: 'stop-head', style: styles.warning }, t2('dialog.needsStopTitle')))
    children.push(React.createElement('div', { key: 'stop-desc', style: styles.items }, t2('dialog.needsStopDesc')))
    children.push(React.createElement('ul', { key: 'stop-list', style: styles.list },
      (phase.activity ?? []).map((entry, index) => React.createElement('li', { key: `${entry?.kind ?? 'work'}-${String(index)}` },
        `${String(entry?.kind ?? 'activity')}${entry?.label === undefined ? '' : `: ${String(entry.label)}`}`)),
    ))
  }
  if (phase.kind === 'done') {
    const freed = formatSize(phase.data?.bytes)
    children.push(React.createElement('div', { key: 'done-head', style: styles.items }, t2('dialog.success')))
    children.push(React.createElement('div', { key: 'done-size', style: styles.hint }, t2('dialog.successSize').replace('{size}', freed)))
    children.push(React.createElement('div', { key: 'done-worktree', style: styles.hint },
      t2('dialog.successWorktree').replace('{status}', String(phase.data?.worktree?.status ?? 'absent'))))
  }
  if (phase.kind === 'error') {
    const reasonKey = phase.code === undefined ? undefined : `reason.${String(phase.code)}`
    const localized = reasonKey === undefined ? reasonKey : t2(reasonKey)
    children.push(React.createElement('div', { key: 'error', style: styles.notice, role: 'alert' },
      localized === reasonKey || localized === undefined
        ? `${t2('reason.delete-failed')}${String(phase.message ?? phase.code ?? '')}`
        : localized))
  }
  if (phase.kind === 'ready' && confirmRequired && typed !== '' && !matches) {
    children.push(React.createElement('div', { key: 'mismatch', style: styles.notice }, t2('dialog.mismatch')))
  }

  return React.createElement(Modal, {
    open: request !== null,
    onClose: close,
    closeLabel: t2('dialog.cancel'),
    title: t2('dialog.title'),
    footer,
  }, ...children)
}

/**
 * Show one diagnostic in the page itself.
 *
 * A Client half that fails to load leaves no visible trace — the context menu
 * would simply do nothing — so failures are surfaced in the document
 * independently of any slot, React, or the Host.
 */
function showBanner(text) {
  try {
    const existing = document.getElementById('session-delete-diagnostic')
    const node = existing ?? document.createElement('div')
    node.id = 'session-delete-diagnostic'
    node.textContent = text
    node.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'left:16px', 'bottom:16px', 'max-width:70vw',
      'padding:10px 12px', 'border-radius:8px', 'background:#7f1d1d', 'color:#fff',
      'font:13px/1.5 system-ui,sans-serif', 'white-space:pre-wrap',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)',
    ].join(';')
    if (existing === null) document.body.appendChild(node)
    setTimeout(() => { node.remove() }, 20000)
  } catch {
    // Diagnostics must never become the failure they report.
  }
}

/** Whether the overlay dialog has been registered into the shell slot. */
let overlayReady = false

/** Whether the dialog rendered for the latest request; a false value means the click was silent. */
let dialogRendered = false

/** Plugin `apply`: dictionaries, the context-menu contribution, and the overlay dialog. */
function apply(ctx) {
  try {
    const t = ctx.locale.bind(NS)
    // Every language carries the English keys it does not translate, so `t`
    // never falls back to a raw key for a locale with a partial dictionary.
    for (const [locale, dict] of Object.entries(DICT)) {
      try {
        ctx.locale.register(NS, locale, { ...DICT.en, ...dict })
      } catch (error) {
        // A development reload re-applies this plugin; a duplicate registration
        // must not take the sidebar down with it.
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
        // The built-in archive entry lives in the popup footer, which renders
        // after every ordinary item regardless of `order`; joining that group is
        // what puts this entry directly below it.
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