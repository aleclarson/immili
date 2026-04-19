import type { Immutable } from 'immer'

import { STATE_TREE, type StateTree } from './blueprints'
import type { TransactionContext } from './transactions'

export interface StoreInstance<S extends object> {
  readonly stateTree: StateTree<S>
  currentSnapshot: Immutable<S>
  readonly publishToReact: ((snapshot: Immutable<S>) => void) | null
  activeTransaction: TransactionContext<S> | null
}

const snapshotOwners = new WeakMap<object, StoreInstance<any>>()

export function createStoreInstance<S extends object>(
  stateTree: StateTree<S>,
  currentSnapshot?: Immutable<S>,
  publishToReact: ((snapshot: Immutable<S>) => void) | null = null,
): StoreInstance<S> {
  const snapshot = currentSnapshot ?? stateTree[STATE_TREE].initialState
  const store: StoreInstance<S> = {
    stateTree,
    currentSnapshot: snapshot,
    publishToReact,
    activeTransaction: null,
  }

  snapshotOwners.set(snapshot, store)
  return store
}

export function publishSnapshot<S extends object>(
  store: StoreInstance<S>,
  snapshot: Immutable<S>,
): void {
  store.currentSnapshot = snapshot
  snapshotOwners.set(snapshot, store)
  store.publishToReact?.(snapshot)
}

export function resolveStoreFromSnapshot<S extends object>(
  snapshot: Immutable<S>,
): StoreInstance<S> {
  const store = snapshotOwners.get(snapshot) as StoreInstance<S> | undefined
  if (!store) {
    throw new Error('State snapshot does not belong to an Immili store instance.')
  }

  return store
}
