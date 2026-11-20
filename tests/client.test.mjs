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
vm.runInContext(source, vm.createContext({ window, console }))
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