import { freeze, immerable, type Draft, type Immutable } from 'immer'

import { isObjectRecord } from './shared'

export const STATE_TREE = Symbol('immili.stateTree')
export const ACTION_TREE = Symbol('immili.actionTree')

type ActionMethod = (...args: any[]) => unknown

/**
 * A nested object shape whose leaves are synchronous action methods.
 */
export interface ActionNamespace {
  readonly [key: string]: ActionMethod | ActionNamespace
}

/**
 * A recursive root patch type used by `actions.merge()`.
 *
 * Plain object members can be patched partially, while arrays and non-object
 * values replace the current value wholesale.
 */
export type DeepPatch<T> = T extends
  | readonly unknown[]
  | Function
  | Promise<any>
  | Date
  | RegExp
  | { [immerable]: false }
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPatch<T[K]> }
    : T

type BoundActionNamespace<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Result
    : T[K] extends object
      ? BoundActionNamespace<T[K]>
      : never
}

/**
 * Root-level imperative helpers that are added to every bound actions object.
 */
export interface RootHelpers<S extends object> {
  merge(patch: DeepPatch<S>): void
  draft(producer: (draft: Draft<S>) => void): void
}

/**
 * The stable actions object returned by `useActions()`.
 *
 * It preserves the nested action tree shape returned by `createActions()` and
 * adds the root `merge()` and `draft()` helpers.
 */
export type BoundActions<S extends object, A extends ActionNamespace> = BoundActionNamespace<A> &
  RootHelpers<S>

interface StateTreeMeta<S extends object> {
  readonly initialState: Immutable<S>
}

interface ActionTreeMeta<S extends object, A extends ActionNamespace> {
  readonly stateTree: StateTree<S>
  readonly factory: (draft: Draft<S>) => A
}

/**
 * An opaque state-tree blueprint created by `createStateTree()`.
 *
 * Pass it to `useStateTree()` to mount or read a store instance.
 */
export interface StateTree<S extends object> {
  readonly [STATE_TREE]: StateTreeMeta<S>
}

/**
 * An opaque action blueprint created by `createActions()`.
 *
 * Bind it to a mounted store instance with `useActions()`.
 */
export interface ActionTree<S extends object, A extends ActionNamespace> {
  readonly [ACTION_TREE]: ActionTreeMeta<S, A>
}

/**
 * Creates a reusable state-tree blueprint from the initial root state shape.
 *
 * The returned value is not a singleton store. Each mounted `useStateTree()`
 * call creates or acquires an independent runtime store instance.
 */
export function createStateTree<S extends object>(initialState: S): StateTree<S> {
  if (!isObjectRecord(initialState) || Array.isArray(initialState)) {
    throw new TypeError('State tree root must be a non-null object.')
  }

  return Object.freeze({
    [STATE_TREE]: {
      initialState: freeze(initialState, true),
    },
  }) as StateTree<S>
}

/**
 * Defines a reusable action blueprint for a state tree.
 *
 * The factory runs each time a new bound actions object is created and receives
 * a stable draft proxy that resolves reads and writes against the current root
 * transaction. Action methods must stay synchronous and may call each other
 * normally.
 */
export function createActions<S extends object, A extends ActionNamespace>(
  stateTree: StateTree<S>,
  factory: (draft: Draft<S>) => A,
): ActionTree<S, A> {
  return Object.freeze({
    [ACTION_TREE]: {
      stateTree,
      factory,
    },
  }) as ActionTree<S, A>
}
