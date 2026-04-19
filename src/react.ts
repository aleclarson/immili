import type { Immutable } from 'immer'
import { useRef, useState } from 'react'

import { createBoundActions } from './actions'
import {
  STATE_TREE,
  type ActionNamespace,
  type ActionTree,
  type BoundActions,
  type StateTree,
} from './blueprints'
import { createStoreInstance, resolveStoreFromSnapshot, type StoreInstance } from './store'

/**
 * Creates or acquires the mounted store instance for the current React root and
 * subscribes the component to every successful commit.
 *
 * The returned state value is the current immutable root snapshot.
 */
export function useStateTree<S extends object>(stateTree: StateTree<S>): Immutable<S> {
  const [snapshot, setSnapshot] = useState(stateTree[STATE_TREE].initialState)

  const storeRef = useRef<StoreInstance<S> | null>(null)
  if (!storeRef.current) {
    storeRef.current = createStoreInstance(stateTree, snapshot, setSnapshot)
  }

  return snapshot
}

/**
 * Returns the stable bound actions object for the store that owns `state`.
 *
 * The `state` argument is used to verify store ownership so that actions cannot
 * be bound to the wrong mounted state tree instance.
 */
export function useActions<S extends object, A extends ActionNamespace>(
  actionTree: ActionTree<S, A>,
  snapshot: Immutable<S>,
): BoundActions<S, A> {
  const store = resolveStoreFromSnapshot(snapshot)
  const cache = useRef<{
    readonly actionTree: ActionTree<S, A>
    readonly actions: BoundActions<S, A>
    readonly store: StoreInstance<S>
  } | null>(null)

  const cached = cache.current
  if (!cached || cached.store !== store || cached.actionTree !== actionTree) {
    const actions = createBoundActions(store, actionTree)
    cache.current = { actionTree, actions, store }
    return actions
  }

  return cached.actions
}
