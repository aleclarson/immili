import { describe, expect, it } from 'vitest'

import {
  createActions,
  createStateTree,
  createStoreInstance,
  getBoundActions,
  subscribeStore,
} from '../src/core'

describe('immili core runtime', () => {
  it('commits nested actions atomically with one notification', () => {
    const AppState = createStateTree({
      feed: { items: ['a'] },
      foo: { bar: 1 },
      user: { id: '1', name: 'Ada' } as null | { id: string; name: string },
    })

    let factoryCalls = 0

    const AppActions = createActions(AppState, (draft) => {
      factoryCalls++

      const feed = {
        reset() {
          draft.feed.items = []
        },
      }

      return {
        auth: {
          logOut() {
            draft.user = null
            feed.reset()
          },
        },
        feed,
      }
    })

    const store = createStoreInstance(AppState)
    const initialSnapshot = store.currentSnapshot
    let notifications = 0

    subscribeStore(store, () => {
      notifications++
    })

    const actions = getBoundActions(AppActions, initialSnapshot)
    expect(factoryCalls).toBe(1)
    expect(actions).toBe(getBoundActions(AppActions, initialSnapshot))

    actions.auth.logOut()

    expect(store.currentSnapshot).not.toBe(initialSnapshot)
    expect(store.currentSnapshot.user).toBeNull()
    expect(store.currentSnapshot.feed.items).toEqual([])
    expect(notifications).toBe(1)
    expect(actions).toBe(getBoundActions(AppActions, store.currentSnapshot))
  })

  it('skips publish and notifications for no-op transactions', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    const AppActions = createActions(AppState, () => ({
      foo: {
        noop() {},
      },
    }))

    const store = createStoreInstance(AppState)
    const initialSnapshot = store.currentSnapshot
    let notifications = 0

    subscribeStore(store, () => {
      notifications++
    })

    getBoundActions(AppActions, initialSnapshot).foo.noop()

    expect(store.currentSnapshot).toBe(initialSnapshot)
    expect(notifications).toBe(0)
  })

  it('deep-merges plain objects and replaces arrays, undefined, and non-plain values', () => {
    const initialDate = new Date('2024-01-01T00:00:00.000Z')
    const nextDate = new Date('2025-01-01T00:00:00.000Z')

    const AppState = createStateTree({
      foo: { bar: 1, baz: 9 },
      list: [1, 2],
      stamp: initialDate,
      user: { id: '1' } as undefined | { id: string },
    })

    const AppActions = createActions(AppState, () => ({}))
    const store = createStoreInstance(AppState)

    getBoundActions(AppActions, store.currentSnapshot).merge({
      foo: { bar: 2 },
      list: [3],
      stamp: nextDate,
      user: undefined,
    })

    expect(store.currentSnapshot.foo).toEqual({ bar: 2, baz: 9 })
    expect(store.currentSnapshot.list).toEqual([3])
    expect(store.currentSnapshot.stamp).toEqual(nextDate)
    expect(store.currentSnapshot.user).toBeUndefined()
  })

  it('rolls back mutations when an action throws', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    const AppActions = createActions(AppState, (draft) => ({
      foo: {
        explode() {
          draft.foo.bar = 2
          throw new Error('boom')
        },
      },
    }))

    const store = createStoreInstance(AppState)
    const initialSnapshot = store.currentSnapshot
    let notifications = 0

    subscribeStore(store, () => {
      notifications++
    })

    expect(() => {
      getBoundActions(AppActions, initialSnapshot).foo.explode()
    }).toThrow('boom')

    expect(store.currentSnapshot).toBe(initialSnapshot)
    expect(store.currentSnapshot.foo.bar).toBe(1)
    expect(notifications).toBe(0)
  })

  it('rejects async actions and leaves state unchanged', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    const AppActions = createActions(AppState, (draft) => ({
      foo: {
        async later() {
          draft.foo.bar = 2
        },
      },
    }))

    const store = createStoreInstance(AppState)
    const initialSnapshot = store.currentSnapshot

    expect(() => {
      getBoundActions(AppActions, initialSnapshot).foo.later()
    }).toThrow('must be synchronous')

    expect(store.currentSnapshot).toBe(initialSnapshot)
    expect(store.currentSnapshot.foo.bar).toBe(1)
  })

  it('throws when the draft proxy is touched outside an active transaction', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    const AppActions = createActions(AppState, (draft) => {
      void draft.foo.bar
      return {}
    })

    const store = createStoreInstance(AppState)

    expect(() => {
      getBoundActions(AppActions, store.currentSnapshot)
    }).toThrow('Draft access is only valid during an active transaction')
  })

  it('reserves merge and draft at the root action level', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    const AppActions = createActions(AppState, () => ({
      merge: {
        nope() {},
      },
    }))

    const store = createStoreInstance(AppState)

    expect(() => {
      getBoundActions(AppActions, store.currentSnapshot)
    }).toThrow('"merge" is a reserved root action name')
  })

  it('fails loudly when actions are resolved with the wrong state tree snapshot', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })
    const OtherState = createStateTree({
      other: { count: 1 },
    })

    const OtherActions = createActions(OtherState, () => ({
      other: {
        increment() {},
      },
    }))

    const store = createStoreInstance(AppState)

    expect(() => {
      getBoundActions(OtherActions as never, store.currentSnapshot as never)
    }).toThrow('different state tree')
  })

  it('initializes each action tree once per store instance', () => {
    const AppState = createStateTree({
      foo: { bar: 1 },
    })

    let factoryCalls = 0

    const AppActions = createActions(AppState, (draft) => {
      factoryCalls++

      return {
        foo: {
          increment() {
            draft.foo.bar++
          },
        },
      }
    })

    const firstStore = createStoreInstance(AppState)
    const firstActions = getBoundActions(AppActions, firstStore.currentSnapshot)

    firstActions.foo.increment()

    expect(factoryCalls).toBe(1)
    expect(firstActions).toBe(getBoundActions(AppActions, firstStore.currentSnapshot))

    const secondStore = createStoreInstance(AppState)
    getBoundActions(AppActions, secondStore.currentSnapshot)

    expect(factoryCalls).toBe(2)
  })
})
