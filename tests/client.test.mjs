/**
 * Client rewind visibility logic: cut derivation from command nodes and the
 * chat-builder wrapper that hides withdrawn transcript rows. Loads the real
 * client factory with a mocked module table so the ported code is exercised.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
let captured
const window = { __ModuleLoader__: { load: (definition) => { captured = definition } } }
// Keep the contextified sandbox so tests can inject a document/console mock.
const sandbox = { window, console }
vm.runInContext(source, vm.createContext(sandbox))
const mockRequire = (name) => {
  if (name === 'react') {
    return {
      createElement: () => null,
      isValidElement: () => false,
      cloneElement: (element) => element,
      Fragment: 'Fragment',
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
    }
  }
  return {}
}
const mod = captured.factory(mockRequire)
const { rewindCutsOf, rewindTargetSeqOfArgs, RewindVisibilityBuilder } = mod.__rewindTest
// vm-context objects carry a different realm prototype; normalize for deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value))

test('rewindTargetSeqOfArgs parses the @seq target', () => {
  assert.equal(rewindTargetSeqOfArgs('@5 both'), 5)
  assert.equal(rewindTargetSeqOfArgs('@12 chat'), 12)
  assert.equal(rewindTargetSeqOfArgs('no target'), undefined)
})

test('rewindCutsOf derives a cut only from a successful rewind command', () => {
  const executed = { kind: 'command', data: { name: 'rewind', args: '@5 both', outcome: { kind: 'success', sourceEventSeq: 8 } } }
  assert.deepEqual(plain(rewindCutsOf([executed])), [{ target: 5, marker: 8 }])
  const errored = { kind: 'command', data: { name: 'rewind', args: '@5 both', outcome: { kind: 'error' } } }
  assert.deepEqual(plain(rewindCutsOf([errored])), [])
  const other = { kind: 'command', data: { name: 'compact', args: '', outcome: { kind: 'success', sourceEventSeq: 8 } } }
  assert.deepEqual(plain(rewindCutsOf([other])), [])
  assert.deepEqual(plain(rewindCutsOf([{ kind: 'user', data: {} }])), [])
})

test('RewindVisibilityBuilder hides nodes inside the [target, marker] span', () => {
  const inner = {
    empty: {},
    replace: (input) => ({ nodes: input.nodes }),
    apply: (input) => ({ upserts: input.upserts }),
    groupInput: () => [],
  }
  const builder = new RewindVisibilityBuilder(inner)
  const nodes = [
    { key: 'u1', kind: 'user', anchorSeq: 1, location: { turn: { turn: 1 } } },
    { key: 'a1', kind: 'assistant-step', anchorSeq: 2, location: { turn: { turn: 1 } } },
    { key: 'u2', kind: 'user', anchorSeq: 5, location: { turn: { turn: 2 } } },
    { key: 'a2', kind: 'assistant-step', anchorSeq: 6, location: { turn: { turn: 2 } } },
    { key: 'cmd', kind: 'command', anchorSeq: 7, data: { name: 'rewind', args: '@5 both', outcome: { kind: 'success', sourceEventSeq: 8 } } },
    { key: 'marker', kind: 'user', anchorSeq: 8, location: { turn: { turn: 2 } } },
  ]
  const result = builder.replace({ nodes, timeline: {} })
  const byKey = Object.fromEntries(result.nodes.map(node => [node.key, node]))
  assert.notEqual(byKey.u1.visibility, 'hidden')
  assert.notEqual(byKey.a1.visibility, 'hidden')
  assert.equal(byKey.u2.visibility, 'hidden')
  assert.equal(byKey.a2.visibility, 'hidden')
  assert.equal(byKey.cmd.visibility, 'hidden')
  assert.equal(byKey.marker.visibility, 'hidden')
})

test('RewindVisibilityBuilder leaves everything visible without a rewind command', () => {
  const inner = { empty: {}, replace: (input) => ({ nodes: input.nodes }), apply: (input) => ({ upserts: input.upserts }) }
  const builder = new RewindVisibilityBuilder(inner)
  const nodes = [
    { key: 'u1', kind: 'user', anchorSeq: 1, location: { turn: { turn: 1 } } },
    { key: 'a1', kind: 'assistant-step', anchorSeq: 2, location: { turn: { turn: 1 } } },
  ]
  const result = builder.replace({ nodes, timeline: {} })
  for (const node of result.nodes) assert.notEqual(node.visibility, 'hidden')
})

test('latestRewindAnchor / chatNodesOf read the newest rewind command node', () => {
  const { latestRewindAnchor, chatNodesOf } = mod.__rewindTest
  const nodes = [
    { key: 'u1', kind: 'user', anchorSeq: 1 },
    { key: 'c1', kind: 'command', anchorSeq: 5, data: { name: 'rewind' } },
    { key: 'c2', kind: 'command', anchorSeq: 9, data: { name: 'rewind' } },
    { key: 'c3', kind: 'command', anchorSeq: 12, data: { name: 'compact' } },
  ]
  const chat = { nodes: { values: () => nodes } }
  assert.equal(latestRewindAnchor(chat), 9)
  assert.equal(chatNodesOf(chat).length, 4)
  assert.equal(latestRewindAnchor(undefined), -1)
})

test('runUndo reports failure when the command outcome is an error, not matched', async () => {
  const { runUndo } = mod.__rewindTest
  let materialized = []
  const chat = { nodes: { values: () => materialized } }
  const uiConversation = { binding: () => ({ target: () => ({ getSnapshot: () => chat }) }) }
  const ctx = {
    get: (name) => name === 'uiConversation' ? uiConversation : undefined,
    sessions: {
      binding: () => ({
        session: {
          command: async () => {
            materialized = [{ kind: 'command', anchorSeq: 10, data: { name: 'rewind', args: '@5 both', outcome: { kind: 'error', text: 'not in model context' } } }]
            return { ok: true, value: { matched: true } }
          },
        },
      }),
    },
  }
  const result = await runUndo(ctx, { sessionId: 's1', seq: 5, text: 'prompt' }, 'both')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'rewind-error')
  assert.equal(result.message, 'not in model context')
})

test('rowRendererOf refuses class components so a DSH upgrade cannot crash the row', () => {
  const { isClassComponent, rowRendererOf } = mod.__rewindTest
  function FnRow() { return null }
  class ClassRow { render() { return null } }
  ClassRow.prototype.isReactComponent = {}
  assert.equal(isClassComponent(FnRow), false)
  assert.equal(isClassComponent(ClassRow), true)
  assert.equal(rowRendererOf(FnRow), FnRow)
  assert.equal(rowRendererOf(ClassRow), undefined)
  // memo-wrapped class component is also refused.
  assert.equal(rowRendererOf({ type: ClassRow }), undefined)
  assert.equal(rowRendererOf({ type: FnRow }), FnRow)
})

test('stylesEffect removes the injected stylesheet on disposal and re-injects on re-apply', () => {
  const { stylesEffect } = mod.__rewindTest
  const nodes = new Map()
  const doc = {
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => ({ id: '', textContent: '', remove() { nodes.delete(this.id) } }),
    head: { appendChild: (node) => { nodes.set(node.id, node) } },
  }
  sandbox.document = doc
  try {
    const disposers = []
    const ctx = { effect: (fn) => { disposers.push(fn()); return () => {} } }
    stylesEffect(ctx)
    assert.equal(nodes.size, 1, 'stylesheet injected')
    // Idempotent re-apply (HMR): the existing node is reused, not duplicated.
    stylesEffect(ctx)
    assert.equal(nodes.size, 1)
    // Disposal removes the node so styles do not linger until a page reload.
    for (const dispose of disposers) dispose()
    assert.equal(nodes.size, 0, 'stylesheet removed on disposal')
    stylesEffect(ctx)
    assert.equal(nodes.size, 1, 're-apply re-injects')
    for (const dispose of disposers) dispose()
  } finally {
    delete sandbox.document
  }
})

test('chat visibility seam degrades visibly and cleans up with a fiber-like inject return', () => {
  const { installChatViewVisibility } = mod.__rewindTest
  const warnings = []
  const realConsole = sandbox.console
  sandbox.console = { warn: (...args) => warnings.push(args.join(' ')), error: () => {}, log: () => {} }
  try {
    // A builder missing `apply`: the wrapper must hand back the original and warn.
    const definition = { target: 'chat', create: () => ({ replace: () => {} }) }
    const views = { entries: () => [definition], subscribe: () => () => {} }
    let cleanup
    const ctx = {
      effect: (fn) => { cleanup = fn(); return () => {} },
      // ctx.inject returns a Fiber (object), never a disposer function.
      inject: (_names, cb) => { cb({ get: () => ({ views }) }); return { dispose: () => {} } },
      sessions: { list: { getSnapshot: () => ({ ids: [], byId: {} }) } },
    }
    installChatViewVisibility(ctx)
    const built = definition.create()
    assert.equal(typeof built.replace, 'function')
    assert.equal(built.apply, undefined, 'unwrappable builder handed back unchanged')
    assert.ok(warnings.some(w => w.includes('shape changed')), 'degradation is visible in the console')
    // Cleanup must not depend on the inject return being callable.
    cleanup()
    assert.equal(typeof definition.create, 'function')
  } finally {
    sandbox.console = realConsole
  }
})

test('row action seam warns once when rows cannot be taken over', () => {
  const { installRowAction } = mod.__rewindTest
  const warnings = []
  const realConsole = sandbox.console
  sandbox.console = { warn: (...args) => warnings.push(args.join(' ')), error: () => {}, log: () => {} }
  try {
    class ClassRow { render() { return null } }
    ClassRow.prototype.isReactComponent = {}
    const entry = { options: { key: 'user', priority: 0 }, component: ClassRow }
    const slots = { entries: () => [entry], register: () => () => {}, subscribe: () => () => {} }
    const cleanup = installRowAction(slots, () => null)
    assert.equal(entry.component, ClassRow, 'class component row left untouched')
    assert.ok(warnings.some(w => w.includes('rewind action')), 'degradation is visible in the console')
    cleanup() // must not throw
    // No eligible entries at all: a different, equally visible degradation.
    const empty = { entries: () => [], register: () => () => {}, subscribe: () => () => {} }
    const cleanup2 = installRowAction(empty, () => null)
    assert.ok(warnings.some(w => w.includes('no user/steering row entries')))
    cleanup2()
  } finally {
    sandbox.console = realConsole
  }
})

test('restoreAttachments rebuilds files in order and binds them through the official intake', async () => {
  const { restoreAttachments } = mod.__rewindTest
  sandbox.File = File
  sandbox.Blob = Blob
  const created = []
  const added = []
  const input = { addAttachments: (ids) => { added.push(ids); return true } }
  const conversation = {
    createDrafts: (sessionId, files, ordinary) => {
      created.push({ sessionId, files, ordinary })
      return files.map((file, index) => ({ id: `d${index}`, file }))
    },
    fileUploads: { getSnapshot: () => ({ d0: { status: 'ready' }, d1: { status: 'ready' } }) },
    input: { for: () => input },
  }
  const ctx = {
    get: (name) => name === 'conversation' ? conversation : undefined,
    sessions: { scope: () => ({}) },
  }
  const face = {
    getSnapshot: () => ({ subagent: null }),
  }
  sandbox.fetch = async (url) => String(url).includes('objects')
    ? { ok: true, blob: async () => new Blob(['img'], { type: 'application/octet-stream' }) }
    : { ok: true, blob: async () => new Blob(['bytes'], { type: 'application/pdf' }) }
  try {
    const wanted = [
      { kind: 'image', attachment: { attachmentId: 'sha256:x', mediaType: 'image/png', name: 'pic.png' }, url: '/api/file?path=%2Fattachments%2Fv1%2Fobjects%2Fxx' },
      { kind: 'file', attachment: { name: 'report.pdf' }, url: '/api/file?path=%2Fattachments%2Fv1%2Ffiles%2Fxx' },
    ]
    const result = await restoreAttachments(ctx, 's1', wanted, face)
    assert.equal(result.restored, 2)
    assert.equal(result.failed, 0)
    assert.equal(result.degraded, false)
    assert.equal(created[0].ordinary, true)
    assert.equal(created[0].files[0].name, 'pic.png')
    // The ref's verified mediaType wins over the extensionless object's
    // octet-stream response type.
    assert.equal(created[0].files[0].type, 'image/png')
    assert.equal(created[0].files[1].name, 'report.pdf')
    assert.equal(created[0].files[1].type, 'application/pdf')
    assert.deepEqual(plain(added[0]), ['d0', 'd1'])
  } finally {
    delete sandbox.fetch
    delete sandbox.File
    delete sandbox.Blob
  }
})

test('restoreAttachments degrades visibly when the conversation service is missing', async () => {
  const { restoreAttachments } = mod.__rewindTest
  const warnings = []
  const realConsole = sandbox.console
  sandbox.console = { warn: (...args) => warnings.push(args.join(' ')), error: () => {}, log: () => {} }
  try {
    const ctx = { get: () => undefined, sessions: { scope: () => ({}) } }
    const result = await restoreAttachments(ctx, 's1', [{ kind: 'image', attachment: {} }], {})
    assert.equal(result.degraded, true)
    assert.equal(result.failed, 1)
    assert.equal(result.restored, 0)
    assert.ok(warnings.some(w => w.includes('attachment')))
  } finally {
    sandbox.console = realConsole
  }
})

test('refillComposer restores an attachment-only message (empty text)', async () => {
  const { refillComposer } = mod.__rewindTest
  sandbox.File = File
  sandbox.Blob = Blob
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  const added = []
  const input = { addAttachments: (ids) => { added.push(ids); return true }, setDraft: () => {} }
  const conversation = {
    createDrafts: (_sessionId, files) => files.map((_file, index) => ({ id: `a${index}` })),
    fileUploads: { getSnapshot: () => ({ a0: { status: 'ready' } }) },
    input: { for: () => input },
  }
  const ctx = {
    get: (name) => name === 'conversation' ? conversation : undefined,
    sessions: { scope: () => ({}) },
  }
  const face = {
    getSnapshot: () => ({ subagent: null }),
  }
  sandbox.fetch = async () => ({ ok: true, blob: async () => new Blob(['img'], { type: 'application/octet-stream' }) })
  try {
    const result = await refillComposer(ctx, 's1', '', { attachments: [{ kind: 'image', attachment: { mediaType: 'image/png', name: 'p.png' }, url: '/api/file?path=%2Fattachments%2Fv1%2Fobjects%2Fxx' }] }, face)
    assert.equal(result.textOk, true)
    assert.equal(result.restored, 1)
    assert.equal(result.failed, 0)
    assert.deepEqual(plain(added[0]), ['a0'])
  } finally {
    delete sandbox.fetch
    delete sandbox.File
    delete sandbox.Blob
    delete sandbox.setTimeout
    delete sandbox.clearTimeout
  }
})

test('restoreAttachments falls back to the binding ctx when no scope is retained', async () => {
  const { restoreAttachments } = mod.__rewindTest
  sandbox.File = File
  sandbox.Blob = Blob
  const added = []
  const input = { addAttachments: (ids) => { added.push(ids); return true } }
  const conversation = {
    createDrafts: (_sessionId, files) => files.map((_file, index) => ({ id: `b${index}` })),
    fileUploads: { getSnapshot: () => ({ b0: { status: 'ready' } }) },
    input: { for: (actx) => actx === scoped ? input : undefined },
  }
  const scoped = {}
  const ctx = {
    get: (name) => name === 'conversation' ? conversation : undefined,
    // No retained scope: only the binding carries the agent context.
    sessions: { scope: () => undefined, binding: () => ({ ctx: scoped }) },
  }
  sandbox.fetch = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'text/markdown' }) })
  try {
    const result = await restoreAttachments(ctx, 's1', [{ kind: 'file', attachment: { name: 'a.md' }, url: '/api/file?path=x' }], { getSnapshot: () => ({ subagent: null }) })
    assert.equal(result.restored, 1)
    assert.equal(result.degraded, false)
    assert.deepEqual(plain(added[0]), ['b0'])
  } finally {
    delete sandbox.fetch
    delete sandbox.File
    delete sandbox.Blob
  }
})

test('runUndo fetches the withdrawn content and reports attachment restore counts', async () => {
  const { runUndo } = mod.__rewindTest
  sandbox.File = File
  sandbox.Blob = Blob
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  let materialized = []
  const chat = { nodes: { values: () => materialized } }
  const uiConversation = {
    binding: () => ({ target: () => ({ getSnapshot: () => chat }) }),
  }
  const conversation = {
    createDrafts: (_sessionId, files) => files.map(() => ({ id: 'z0' })),
    fileUploads: { getSnapshot: () => ({ z0: { status: 'ready' } }) },
    input: { for: () => ({ setDraft: () => {}, addAttachments: () => true }) },
  }
  const face = {
    command: async () => {
      materialized = [{ kind: 'command', anchorSeq: 10, data: { name: 'rewind', args: '@5 both', outcome: { kind: 'success', sourceEventSeq: 8, text: 'Rewound' } } }]
      return { ok: true }
    },
    getSnapshot: () => ({ subagent: null }),
  }
  const ctx = {
    get: (name) => name === 'uiConversation' ? uiConversation : name === 'conversation' ? conversation : undefined,
    sessions: { binding: () => ({ session: face }), scope: () => ({}) },
  }
  sandbox.fetch = async (url) => {
    if (String(url).includes('message-content')) {
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, data: { seq: 5, text: 'prompt', attachments: [{ kind: 'image', attachment: { mediaType: 'image/png', name: 'p.png' }, url: '/api/file?path=%2Fattachments%2Fv1%2Fobjects%2Fxx' }], omitted: 0 } }),
      }
    }
    return { ok: true, blob: async () => new Blob(['x']) }
  }
  try {
    const result = await runUndo(ctx, { sessionId: 's1', seq: 5, text: 'prompt' }, 'both')
    assert.equal(result.ok, true)
    assert.equal(result.prefillOk, true)
    assert.equal(result.attachmentsRestored, 1)
    assert.equal(result.attachmentsFailed, 0)
    assert.equal(result.attachmentsDegraded, false)
  } finally {
    delete sandbox.fetch
    delete sandbox.File
    delete sandbox.Blob
    delete sandbox.setTimeout
    delete sandbox.clearTimeout
  }
})