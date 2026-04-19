import type { Draft, Immutable } from 'immer'

import {
  ACTION_TREE,
  type ActionNamespace,
  type ActionTree,
  type BoundActions,
  type DeepPatch,
} from './blueprints'
import { applyMergePatch } from './patch'
import { isObjectRecord, isPlainObject } from './shared'
import { resolveStoreFromSnapshot, type StoreInstance } from './store'
import { createDraftProxy, getActiveRootDraft, runWithTransaction } from './transactions'

const RESERVED_ROOT_HELPERS = new Set(['merge', 'draft'])

export function getBoundActions<S extends object, A extends ActionNamespace>(
  actionTree: ActionTree<S, A>,
  snapshot: Immutable<S>,
): BoundActions<S, A> {
  const store = resolveStoreFromSnapshot(snapshot)
  return createBoundActions(store, actionTree)
}

export function createBoundActions<S extends object, A extends ActionNamespace>(
  store: StoreInstance<S>,
  actionTree: ActionTree<S, A>,
): BoundActions<S, A> {
  const actionMeta = actionTree[ACTION_TREE]

  if (store.stateTree !== actionMeta.stateTree) {
    throw new Error('State snapshot belongs to a different state tree.')
  }

  const unboundActions = actionTree[ACTION_TREE].factory(createDraftProxy(store))

  if (!isObjectRecord(unboundActions) || Array.isArray(unboundActions)) {
    throw new TypeError('Action factory must return an object tree.')
  }

  const actions = bindNamespace(store, unboundActions, '') as BoundActions<S, A>

  actions.merge = function (patch: DeepPatch<S>) {
    if (!isPlainObject(patch)) {
      throw new TypeError('merge() expects a plain object patch.')
    }
    runWithTransaction(store, 'merge', () => {
      applyMergePatch(getActiveRootDraft(store), patch)
    })
  }

  actions.draft = function (producer: (draft: Draft<S>) => void) {
    runWithTransaction(store, 'draft', () => {
      producer(getActiveRootDraft(store))
    })
  }

  return Object.freeze(actions) as BoundActions<S, A>
}

function bindNamespace<S extends object>(
  store: StoreInstance<S>,
  value: ActionNamespace,
  path: string,
): object {
  const bound: Record<string, unknown> = {}

  for (const key of Object.keys(value)) {
    if (path.length === 0 && RESERVED_ROOT_HELPERS.has(key)) {
      throw new Error(`"${key}" is a reserved root action name.`)
    }

    const member = value[key]
    const actionPath = path ? `${path}.${key}` : key

    if (typeof member === 'function') {
      bound[key] = (...args: unknown[]) => {
        return runWithTransaction(store, actionPath, () => member(...args))
      }
      continue
    }

    if (!isObjectRecord(member) || Array.isArray(member)) {
      throw new TypeError(`Action "${actionPath}" must be a function or nested object.`)
    }

    bound[key] = bindNamespace(store, member, actionPath)
  }

  if (path.length === 0) {
    return bound
  }
  return Object.freeze(bound)
}
