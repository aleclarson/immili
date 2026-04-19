import {
  createDraft,
  finishDraft,
  freeze,
  type Draft,
  type Immutable,
} from 'immer'

const STATE_TREE = Symbol('immili.stateTree')
const ACTION_TREE = Symbol('immili.actionTree')

const RESERVED_ROOT_HELPERS = new Set(['merge', 'draft'])

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
export type DeepPatch<T> =
  T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPatch<T[K]> }
      : T

type BoundActionNamespace<T> = {
  [K in keyof T]:
    T[K] extends (...args: infer Args) => infer Result
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
export type BoundActions<
  S extends object,
  A extends ActionNamespace,
> = BoundActionNamespace<A> & RootHelpers<S>

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

interface TransactionContext<S extends object> {
  readonly baseSnapshot: Immutable<S>
  readonly rootDraft: Draft<S>
  readonly rootActionName: string | null
}

export interface StoreInstance<S extends object> {
  readonly stateTree: StateTree<S>
  currentSnapshot: Immutable<S>
  readonly subscribers: Set<() => void>
  readonly actionCache: Map<object, unknown>
  activeTransaction: TransactionContext<S> | null
}

const snapshotOwners = new WeakMap<object, StoreInstance<any>>()

/**
 * Creates a reusable state-tree blueprint from the initial root state shape.
 *
 * The returned value is not a singleton store. Each mounted `useStateTree()`
 * call creates or acquires an independent runtime store instance.
 */
export function createStateTree<S extends object>(
  initialState: S,
): StateTree<S> {
  if (!isObjectRecord(initialState) || Array.isArray(initialState)) {
    throw new TypeError('State tree root must be a non-null object.')
  }

  return Object.freeze({
    [STATE_TREE]: {
      initialState: freeze(cloneValue(initialState), true),
    },
  }) as StateTree<S>
}

/**
 * Defines a reusable action blueprint for a state tree.
 *
 * The factory runs once per mounted store instance and receives a stable draft
 * proxy that resolves reads and writes against the current root transaction.
 * Action methods must stay synchronous and may call each other normally.
 */
export function createActions<
  S extends object,
  A extends ActionNamespace,
>(
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

export function createStoreInstance<S extends object>(
  stateTree: StateTree<S>,
): StoreInstance<S> {
  const snapshot = cloneSnapshot(stateTree[STATE_TREE].initialState)
  const store: StoreInstance<S> = {
    stateTree,
    currentSnapshot: snapshot,
    subscribers: new Set(),
    actionCache: new Map(),
    activeTransaction: null,
  }

  snapshotOwners.set(snapshot as object, store)
  return store
}

export function subscribeStore<S extends object>(
  store: StoreInstance<S>,
  subscriber: () => void,
): () => void {
  store.subscribers.add(subscriber)
  return () => {
    store.subscribers.delete(subscriber)
  }
}

export function getBoundActions<
  S extends object,
  A extends ActionNamespace,
>(
  actionTree: ActionTree<S, A>,
  snapshot: Immutable<S>,
): BoundActions<S, A> {
  const store = resolveStoreFromSnapshot(snapshot)
  const actionMeta = actionTree[ACTION_TREE]

  if (store.stateTree !== actionMeta.stateTree) {
    throw new Error('State snapshot belongs to a different state tree.')
  }

  const cached = store.actionCache.get(actionTree) as BoundActions<S, A> | undefined
  if (cached) {
    return cached
  }

  const boundActions = bindActionTree(store, actionTree)
  store.actionCache.set(actionTree, boundActions)
  return boundActions
}

function bindActionTree<
  S extends object,
  A extends ActionNamespace,
>(
  store: StoreInstance<S>,
  actionTree: ActionTree<S, A>,
): BoundActions<S, A> {
  const actions = actionTree[ACTION_TREE].factory(createDraftProxy(store))

  if (!isObjectRecord(actions) || Array.isArray(actions)) {
    throw new TypeError('Action factory must return an object tree.')
  }

  for (const key of Object.keys(actions)) {
    if (RESERVED_ROOT_HELPERS.has(key)) {
      throw new Error(`"${key}" is a reserved root action name.`)
    }
  }

  const bound = bindNamespace(store, actions, '') as BoundActionNamespace<A>
  const result = {
    ...bound,
    merge(patch: DeepPatch<S>) {
      if (!isPlainObject(patch)) {
        throw new TypeError('merge() expects a plain object patch.')
      }

      runWithTransaction(store, 'merge', () => {
        applyMergePatch(getActiveRootDraft(store), patch)
      })
    },
    draft(producer: (draft: Draft<S>) => void) {
      runWithTransaction(store, 'draft', () => {
        producer(getActiveRootDraft(store))
      })
    },
  } as BoundActions<S, A>

  return deepFreezeObject(result)
}

function bindNamespace<S extends object>(
  store: StoreInstance<S>,
  value: ActionNamespace,
  path: string,
): object {
  const bound: Record<string, unknown> = {}

  for (const key of Object.keys(value)) {
    const member = value[key]
    const actionPath = path ? `${path}.${key}` : key

    if (typeof member === 'function') {
      bound[key] = (...args: unknown[]) => {
        return runWithTransaction(store, actionPath, () => member(...args))
      }
      continue
    }

    if (!isObjectRecord(member) || Array.isArray(member)) {
      throw new TypeError(
        `Action "${actionPath}" must be a function or nested object.`,
      )
    }

    bound[key] = bindNamespace(store, member, actionPath)
  }

  return Object.freeze(bound)
}

function runWithTransaction<S extends object, T>(
  store: StoreInstance<S>,
  actionPath: string,
  fn: () => T,
): T {
  if (store.activeTransaction) {
    const result = fn()
    assertSynchronous(result, actionPath)
    return result
  }

  return runRootTransaction(store, actionPath, fn)
}

function runRootTransaction<S extends object, T>(
  store: StoreInstance<S>,
  actionPath: string,
  fn: () => T,
): T {
  const baseSnapshot = store.currentSnapshot

  store.activeTransaction = {
    baseSnapshot,
    rootDraft: createDraft(baseSnapshot as S),
    rootActionName: actionPath,
  }

  try {
    const result = fn()
    assertSynchronous(result, actionPath)

    const transaction = store.activeTransaction
    if (!transaction) {
      throw new Error('Expected an active transaction.')
    }

    const nextSnapshot = finishDraft(transaction.rootDraft) as Immutable<S>
    store.activeTransaction = null

    if (nextSnapshot !== baseSnapshot) {
      store.currentSnapshot = nextSnapshot
      snapshotOwners.set(nextSnapshot as object, store)
      notifySubscribers(store)
    }

    return result
  } catch (error) {
    store.activeTransaction = null
    throw error
  }
}

function createDraftProxy<S extends object>(
  store: StoreInstance<S>,
): Draft<S> {
  const resolveDraft = () => {
    const draft = store.activeTransaction?.rootDraft
    if (!draft) {
      throw new Error('Draft access is only valid during an active transaction.')
    }

    return draft
  }

  return new Proxy({} as Draft<S>, {
    defineProperty(_, prop, descriptor) {
      return Reflect.defineProperty(resolveDraft() as object, prop, descriptor)
    },
    deleteProperty(_, prop) {
      return Reflect.deleteProperty(resolveDraft() as object, prop)
    },
    get(_, prop) {
      const draft = resolveDraft() as object
      return Reflect.get(draft, prop, draft)
    },
    getOwnPropertyDescriptor(_, prop) {
      return Reflect.getOwnPropertyDescriptor(resolveDraft() as object, prop)
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolveDraft() as object)
    },
    has(_, prop) {
      return Reflect.has(resolveDraft() as object, prop)
    },
    isExtensible() {
      return Reflect.isExtensible(resolveDraft() as object)
    },
    ownKeys() {
      return Reflect.ownKeys(resolveDraft() as object)
    },
    preventExtensions() {
      return Reflect.preventExtensions(resolveDraft() as object)
    },
    set(_, prop, value) {
      return Reflect.set(resolveDraft() as object, prop, value)
    },
    setPrototypeOf(_, prototype) {
      return Reflect.setPrototypeOf(resolveDraft() as object, prototype)
    },
  })
}

function getActiveRootDraft<S extends object>(
  store: StoreInstance<S>,
): Draft<S> {
  const draft = store.activeTransaction?.rootDraft
  if (!draft) {
    throw new Error('Expected an active transaction.')
  }

  return draft
}

function resolveStoreFromSnapshot<S extends object>(
  snapshot: Immutable<S>,
): StoreInstance<S> {
  if (!isObjectRecord(snapshot) || Array.isArray(snapshot)) {
    throw new Error('State snapshot must be the root object returned by useStateTree().')
  }

  const store = snapshotOwners.get(snapshot as object) as StoreInstance<S> | undefined
  if (!store) {
    throw new Error('State snapshot does not belong to an immili store instance.')
  }

  return store
}

function applyMergePatch(target: object, patch: object): void {
  for (const key of Object.keys(patch)) {
    const patchValue = (patch as Record<string, unknown>)[key]
    const currentValue = (target as Record<string, unknown>)[key]

    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      applyMergePatch(currentValue, patchValue)
      continue
    }

    ;(target as Record<string, unknown>)[key] = patchValue
  }
}

function notifySubscribers<S extends object>(store: StoreInstance<S>): void {
  for (const subscriber of Array.from(store.subscribers)) {
    subscriber()
  }
}

function assertSynchronous(value: unknown, actionPath: string): void {
  if (isPromiseLike(value)) {
    throw new Error(`Action "${actionPath}" must be synchronous.`)
  }
}

function cloneSnapshot<S extends object>(snapshot: Immutable<S>): Immutable<S> {
  return freeze(cloneValue(snapshot), true)
}

function cloneValue<T>(value: T): T {
  const structuredCloneFn = (
    globalThis as typeof globalThis & {
      structuredClone?: <U>(value: U) => U
    }
  ).structuredClone

  if (!structuredCloneFn) {
    throw new Error('structuredClone() is required to initialize state trees.')
  }

  return structuredCloneFn(value)
}

function deepFreezeObject<T extends object>(value: T): T {
  for (const nested of Object.values(value)) {
    if (isObjectRecord(nested) && !Object.isFrozen(nested)) {
      deepFreezeObject(nested)
    }
  }

  return Object.freeze(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value) || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}
