import { useRef, useSyncExternalStore } from 'react'

export {
  createActions,
  createStateTree,
  type ActionNamespace,
  type ActionTree,
  type BoundActions,
  type DeepPatch,
  type RootHelpers,
  type StateTree,
} from './core'
import {
  createStoreInstance,
  getBoundActions,
  subscribeStore,
  type ActionNamespace,
  type ActionTree,
  type BoundActions,
  type StoreInstance,
  type StateTree,
} from './core'
import type { Immutable } from 'immer'

/**
 * Creates or acquires the mounted store instance for the current React root and
 * subscribes the component to every successful commit.
 *
 * The returned state value is the current immutable root snapshot.
 */
export function useStateTree<S extends object>(
  stateTree: StateTree<S>,
): Immutable<S> {
  const storeRef = useRef<StoreInstance<S> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createStoreInstance(stateTree)
  }

  const store = storeRef.current

  return useSyncExternalStore(
    (subscriber) => subscribeStore(store, subscriber),
    () => store.currentSnapshot,
    () => store.currentSnapshot,
  )
}

/**
 * Returns the stable bound actions object for the store that owns `state`.
 *
 * The `state` argument is used to verify store ownership so that actions cannot
 * be bound to the wrong mounted state tree instance.
 */
export function useActions<
  S extends object,
  A extends ActionNamespace,
>(
  actionTree: ActionTree<S, A>,
  state: Immutable<S>,
): BoundActions<S, A> {
  return getBoundActions(actionTree, state)
}
