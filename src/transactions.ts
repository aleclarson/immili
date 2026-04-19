import { createDraft, finishDraft, type Draft, type Immutable } from 'immer'

import { isPromiseLike } from './shared'
import { publishSnapshot, type StoreInstance } from './store'

export interface TransactionContext<S extends object> {
  readonly baseSnapshot: Immutable<S>
  readonly rootDraft: Draft<S>
  readonly rootActionName: string | null
}

export function runWithTransaction<S extends object, T>(
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

export function createDraftProxy<S extends object>(store: StoreInstance<S>): Draft<S> {
  const resolveDraft = () => {
    const draft = store.activeTransaction?.rootDraft
    if (!draft) {
      throw new Error('Draft access is only valid during an active transaction.')
    }

    return draft
  }

  return new Proxy({} as Draft<S>, {
    defineProperty(_, prop, descriptor) {
      return Reflect.defineProperty(resolveDraft(), prop, descriptor)
    },
    deleteProperty(_, prop) {
      return Reflect.deleteProperty(resolveDraft(), prop)
    },
    get(_, prop) {
      const draft = resolveDraft()
      return Reflect.get(draft, prop, draft)
    },
    getOwnPropertyDescriptor(_, prop) {
      return Reflect.getOwnPropertyDescriptor(resolveDraft(), prop)
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolveDraft())
    },
    has(_, prop) {
      return Reflect.has(resolveDraft(), prop)
    },
    isExtensible() {
      return Reflect.isExtensible(resolveDraft())
    },
    ownKeys() {
      return Reflect.ownKeys(resolveDraft())
    },
    preventExtensions() {
      return Reflect.preventExtensions(resolveDraft())
    },
    set(_, prop, value) {
      return Reflect.set(resolveDraft(), prop, value)
    },
    setPrototypeOf(_, prototype) {
      return Reflect.setPrototypeOf(resolveDraft(), prototype)
    },
  })
}

export function getActiveRootDraft<S extends object>(store: StoreInstance<S>): Draft<S> {
  const draft = store.activeTransaction?.rootDraft
  if (!draft) {
    throw new Error('Expected an active transaction.')
  }

  return draft
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
      publishSnapshot(store, nextSnapshot)
    }

    return result
  } catch (error) {
    store.activeTransaction = null
    throw error
  }
}

function assertSynchronous(value: unknown, actionPath: string): void {
  if (isPromiseLike(value)) {
    throw new Error(`Action "${actionPath}" must be synchronous.`)
  }
}
