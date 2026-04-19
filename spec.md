# Technical Design: Minimal Immer-First React State Library

## Status

Draft for team review

## Summary

This document specifies a minimal client-side state library for simple React SPA applications, optimized for rapid prototyping and agentic code generation.

The library is intentionally opinionated:

* All client app state lives in a single root state tree.
* Server state remains outside the library and is expected to live in the TanStack Query cache.
* Reads happen from immutable snapshots.
* Writes happen only through actions or root-level imperative helpers.
* All mutations are executed against a single root Immer draft and committed atomically.
* React updates are coarse-grained by design: any committed state change re-renders all components subscribed to the store instance.
* The library is designed for the React Compiler era and does not attempt fine-grained subscriptions or selector-based invalidation.

The intended result is a very small mental model that is easy for humans and LLMs to generate correctly.

---

# 1. Goals

## Primary goals

1. **Keep the API extremely small**
   The library should be teachable in a few minutes and easy to use correctly without patterns like reducers, selectors, thunks, or action creators.

2. **Be Immer-first**
   Complex updates should feel natural. Direct draft mutation is the default write model.

3. **Support fast prototyping**
   The library should favor clarity and low ceremony over exhaustiveness or architectural purity.

4. **Work well with agentic code generation**
   The library should have one idiomatic style, few edge-case APIs, and deterministic semantics.

5. **Align with immutable React state**
   State reads should be snapshot-based and composable with normal React rendering.

6. **Provide atomic transactions**
   Each root write should produce one commit or no commit.

## Non-goals

1. Fine-grained subscriptions or selector memoization.
2. Built-in async action model.
3. Server-state fetching, caching, retrying, or invalidation.
4. Cross-tab sync or persistence as a core feature.
5. Redux-like middleware pipelines as a core abstraction.
6. Full devtools UI in the initial version.
7. SSR-specific optimizations in the initial version.

---

# 2. Design principles

## 2.1 Single state namespace

All local application state is stored in one root object. There are no independent atoms, slices, or stores within a single store instance.

## 2.2 Read from snapshots, write through actions

Components consume immutable snapshots. Mutations occur only through bound actions or imperative root write helpers.

## 2.3 Coarse invalidation is acceptable

The library intentionally invalidates the full subscribed tree on any commit. Users are expected to rely on React composition discipline and the React Compiler rather than fine-grained subscriptions.

## 2.4 One idiomatic usage style

The library teaches a preferred way to write code:

* Read from `state` as late as possible.
* Avoid aliasing local state prematurely.
* Avoid passing the full `state` object deep into the tree.
* Pass `actions` through React context.
* Prefer named actions for business logic.
* Use `merge()` for obvious structural updates.
* Use `draft()` for imperative one-off mutations.

## 2.5 Plain JavaScript over framework magic

Action composition should work through ordinary closures and method calls, not through hidden `this` behavior or runtime rebinding.

---

# 3. Public API

## 3.1 `createStateTree(initialState)`

Creates a reusable store blueprint.

```ts
type Foo = {
  bar: number
}

type User = null | {
  id: string
  name: string
}

type AppState = {
  foo: Foo
  user: User
}

const AppStateTree = createStateTree<AppState>({
  foo: { bar: 1 },
  user: null,
})
```

### Semantics

* Accepts the initial root state shape.
* Returns a reusable store blueprint, not a singleton runtime store.
* The blueprint may be mounted multiple times to create independent store instances.

## 3.2 `createActions(stateTree, factory)`

Defines an action blueprint associated with a state tree.

```ts
const AppActions = createActions(AppState, (draft) => {
  const feed = {
    reset() {
      draft.feed.items = []
    },
  }

  const auth = {
    logOut() {
      draft.user = null
      feed.reset()
    },
  }

  return {
    auth,
    feed,
  }
})
```

### Semantics

* `factory` is called once per store instance.
* The `draft` parameter is a **stable proxy** that resolves reads and writes against the current transaction's root draft.
* Because `draft` is a proxy rather than a concrete draft object, actions may be initialized once and reused across commits.
* Action methods compose using normal closure references.
* Action methods are synchronous only.
* Nested action calls participate in the same root transaction.

## 3.3 `useStateTree(stateTree)`

Creates or acquires the store instance for the current mounted root and subscribes the component to commits.

```ts
function App() {
  const state = useStateTree(AppStateTree)
  return <div>{state.foo.bar}</div>
}
```

### Semantics

* Returns the current immutable snapshot of the store instance.
* Triggers a component re-render whenever the store instance commits any new root snapshot.
* Returned snapshots are immutable.
* Snapshot identity changes only when a commit succeeds.

## 3.4 `useActions(actionTree, state)`

Returns the stable bound actions object for a store instance.

```ts
function App() {
  const state = useStateTree(AppStateTree)
  const actions = useActions(AppActions, state)
  return <button onClick={() => actions.foo.incrementBar()} />
}
```

### Semantics

* Returns a stable reference for the lifetime of the store instance.
* Requires the state snapshot argument to identify the owning store instance.
* Bound actions always operate on the latest transaction context, not on the specific snapshot object passed into `useActions()`.

## 3.5 `actions.merge(patch)`

Applies a deep merge patch at the root.

```ts
actions.merge({
  foo: { bar: 2 },
})
```

## 3.6 `actions.draft(producer)`

Runs an imperative draft mutation at the root.

```ts
actions.draft((draft) => {
  draft.foo.bar++
})
```

### Semantics for `merge()` and `draft()`

* Both are root-level writes.
* Both create a root transaction when called from outside an existing transaction.
* When called from inside an existing action transaction, they join the current transaction.
* Both produce at most one final commit at the end of the root transaction.

---

# 4. Intended usage

## 4.1 Recommended component style

```ts
export function App() {
  const state = useStateTree(AppState)
  const actions = useActions(AppActions, state)

  return (
    <button onClick={() => actions.foo.incrementBar()}>
      {state.foo.bar}
    </button>
  )
}
```

## 4.2 Recommended state type composition pattern

Recommended authoring pattern:

* Define a type alias for each state namespace.
* Compose the root app state type alias from those namespace aliases.
* Pass namespace-typed slices to child components when that improves component locality.
* Avoid re-declaring namespace property shapes inline in component prop types.

Example:

```ts
type Foo = {
  bar: number
}

type Feed = {
  items: string[]
}

type User = null | {
  id: string
  name: string
}

type AppState = {
  foo: Foo
  feed: Feed
  user: User
}

const AppStateTree = createStateTree<AppState>({
  foo: { bar: 1 },
  feed: { items: [] },
  user: null,
})
```

Rationale:

* Avoids duplicating property definitions across component prop types.
* Makes namespace ownership explicit in the type system.
* Makes it easier to pass state namespaces to child components without inventing separate prop-shape types.
* Works well with the library’s single-root-state model.

Example component usage:

```tsx
type Foo = {
  bar: number
}

function FooPanel(props: {
  foo: Foo
  onIncrement(): void
}) {
  return (
    <button onClick={props.onIncrement}>
      {props.foo.bar}
    </button>
  )
}
```

This pattern is recommended when a child component clearly owns or renders a specific namespace. It does not change the general guidance to avoid passing the entire root `state` object deep into the tree.

## 4.3 Recommended discipline

### Do

* Read directly from `state` at the point of use.
* Use named actions for business logic and multi-step mutations.
* Pass `actions` through React context to child components.
* Keep server state in TanStack Query.

### Avoid

* Pre-emptive local aliases like `const foo = state.foo` unless necessary.
* Passing the entire `state` object to child components.
* Mutating snapshots.
* Writing async logic inside actions.

## 4.3 Ownership guidance

The runtime allows any action to mutate any part of the root draft. The idiomatic style is:

* Prefer mutating the namespace owned by the current action.
* Prefer calling sibling actions for sibling-domain behavior.
* Use cross-namespace writes directly only when they are simpler and clearer.

This ownership model is a convention, not a hard runtime restriction.

---

# 5. Runtime semantics

## 5.1 Core concepts

### Store blueprint

A static definition of a root state shape.

### Store instance

A mounted runtime instance containing:

* current immutable root snapshot
* subscriber set
* action instance cache
* active transaction context, if any

### Action blueprint

A static action definition associated with a specific state tree blueprint.

### Bound actions object

The result of instantiating an action blueprint against a store instance.

### Root transaction

A synchronous mutation session over a single Immer root draft.

## 5.2 Snapshot model

* Components always read from immutable snapshots.
* Snapshots are never mutated after publication.
* Each successful root transaction produces a new snapshot identity.
* If a root transaction produces no changes, the library may retain snapshot identity.

## 5.3 Action factory model

The action factory is initialized once per store instance.

Important detail:

* The `draft` parameter passed to `createActions(..., factory)` is **not** an Immer draft object captured at initialization time.
* It is a stable proxy whose traps resolve against the store instance's currently active root draft.
* Outside an active transaction, draft access should throw in development.

This allows the actions object to be stable while still operating on the current transaction state.

## 5.4 Transaction boundaries

A root transaction starts when one of the following is called outside an active transaction:

* any bound action method
* `actions.merge(...)`
* `actions.draft(...)`

A root transaction ends when the root call returns or throws.

### On success

* finalize the Immer root draft
* publish the next immutable snapshot
* notify subscribers

### On error

* discard the unfinished draft
* publish nothing
* notify no subscribers
* rethrow the error

## 5.5 Nested action calls

Nested action calls do not create nested commits.

Example:

```ts
const AppActions = createActions(AppState, (draft) => {
  const feed = {
    reset() {
      draft.feed.items = []
    },
  }

  const auth = {
    logOut() {
      draft.user = null
      feed.reset()
    },
  }

  return { auth, feed }
})
```

Calling `actions.auth.logOut()` creates one root transaction and one commit.

## 5.6 Synchronous-only actions

Actions must be synchronous.

### Rationale

* Keeps transaction semantics trivial.
* Avoids holding drafts across `await` boundaries.
* Pushes async concerns to React hooks, event handlers, or TanStack Query.

### Enforcement

In development, if an action returns a Promise, the runtime should throw or warn loudly.

---

# 6. Merge semantics

`merge()` applies a deep merge patch at the root.

This behavior must be precisely specified to avoid ambiguity.

## 6.1 Merge rules

Recommended rules:

1. **Plain objects recurse**
   When both existing value and patch value are plain objects, merge recursively by key.

2. **Arrays replace wholesale**
   Arrays are not merged element-wise.

3. **Primitives replace**
   Strings, numbers, booleans, bigints, symbols, and `null` replace the existing value.

4. **Non-plain objects replace**
   Dates, Maps, Sets, class instances, and other non-plain objects replace the existing value.

5. **Missing patch keys preserve existing values**
   Merge is partial.

6. **`undefined` behavior must be explicit**
   Recommended: treat an explicitly provided `undefined` as replacement with `undefined`, not as omission.

## 6.2 Example

```ts
actions.merge({
  foo: { bar: 2 },
})
```

Given:

```ts
{
  foo: { bar: 1, baz: 9 },
  user: { id: '1' },
}
```

Result:

```ts
{
  foo: { bar: 2, baz: 9 },
  user: { id: '1' },
}
```

## 6.3 Implementation note

`merge()` should be implemented as a root transaction over the current draft, not as an out-of-band snapshot transform.

---

# 7. React integration

## 7.1 Subscription model

`useStateTree()` subscribes the component to the store instance. Any successful commit schedules a re-render for all subscribed components.

## 7.2 No fine-grained subscriptions

The library intentionally does not track property-level reads or memoized selectors.

### Rationale

* Smaller runtime.
* Simpler mental model.
* Better fit for prototype-oriented development.
* Compatible with the React Compiler direction.

## 7.3 Reading discipline

The recommendation to avoid premature dereferencing exists to improve code clarity, not runtime performance.

This style makes local state dependencies easy to spot and answers the question: **who owns this state?** without following alias chains.

## 7.4 Passing actions through context

Because the actions object is stable per store instance, it is well-suited for React context propagation.

Recommended pattern:

* root component calls `useActions(...)`
* provide `actions` through context
* deeply nested components consume only the action methods they need

---

# 8. Type system design

## 8.1 Type goals

* Infer state shape from `createStateTree()`.
* Support an explicit root state type alias composed from namespace type aliases using plain domain-object names.
* Encourage namespace-level type reuse across component props.
* Infer action tree shape from `createActions()`.
* Expose a mutable root draft type inside the action factory callback.
* Expose immutable snapshot types from `useStateTree()`.
* Preserve action method types through nested namespaces.

## 8.2 Recommended state typing style

Recommended pattern:

```ts
type Foo = {
  bar: number
}

type Feed = {
  items: string[]
}

type User = null | {
  id: string
  name: string
}

type AppState = {
  foo: Foo
  feed: Feed
  user: User
}
```

This pattern should be preferred over repeatedly writing inline object literals in component prop types.

### Benefits

* Namespace shapes are declared once.
* Component props can reference namespace types directly.
* Changes to a namespace shape propagate automatically.
* The relationship between root state structure and UI ownership stays obvious.

## 8.3 Snapshot type

`useStateTree(AppState)` should return a deeply readonly snapshot type in TypeScript.

Example intent:

```ts
type Snapshot = DeepReadonly<AppStateShape>
```

## 8.3 Draft type in action factory

`createActions(AppState, (draft) => actions)` should infer `draft` as the mutable root draft type.

Example intent:

```ts
type DraftRoot = ImmerDraft<AppStateShape>
```

## 8.4 Bound actions type

`useActions(AppActions, state)` should return the same nested action tree shape produced by the factory, with stable callable methods plus root helpers like `merge()` and `draft()`.

Example intent:

```ts
type BoundActions = {
  foo: {
    incrementBar(): void
  }
  merge(patch: DeepPartial<AppStateShape>): void
  draft(producer: (draft: ImmerDraft<AppStateShape>) => void): void
}
```

## 8.5 Component props with namespace types

Recommended example:

```tsx
type FooProps = {
  foo: Foo
  onIncrement(): void
}

function FooPanel({ foo, onIncrement }: FooProps) {
  return <button onClick={onIncrement}>{foo.bar}</button>
}
```

This pattern is explicitly supported by the library’s idioms. The guidance is:

* passing a focused namespace to a child is good
* passing the full root `state` object broadly is discouraged

## 8.6 `merge()` patch typing

Recommended type:

```ts
type DeepPatch<T> = {
  [K in keyof T]?: T[K] extends readonly any[]
    ? T[K]
    : T[K] extends object
      ? DeepPatch<T[K]>
      : T[K]
}
```

Final exact typing may need refinement for non-plain objects.

---

# 9. Internal architecture

## 9.1 Suggested internal store shape

```ts
interface StoreInstance<S, A> {
  currentSnapshot: S
  subscribers: Set<() => void>
  boundActions: A | null
  activeTransaction: TransactionContext<S> | null
}
```

## 9.2 Transaction context

```ts
interface TransactionContext<S> {
  rootDraft: Draft<S>
  depth: number
  rootActionName: string | null
  startTime: number
  mutationCount: number
}
```

`depth` is optional but can simplify nested action bookkeeping.

## 9.3 Draft proxy

The stable proxy used in action initialization should:

* resolve property gets against `activeTransaction.rootDraft`
* resolve property sets against `activeTransaction.rootDraft`
* behave as a live pointer to the current root draft for the active transaction
* throw in development if accessed when no active transaction exists

Important clarification:

* this proxy does not need to implement its own deep lazy wrapping strategy
* Immer already materializes nested drafts lazily as properties are accessed on the current root draft
* the library proxy only needs to forward operations to whatever the current active root draft is

This proxy is the key mechanism that allows action objects to be created once while still targeting the current transaction.

## 9.4 Bound action wrapping

Each action method should be wrapped at bind time so the runtime can:

* detect whether a root transaction must be opened
* track root action name
* finalize or rollback appropriately

Pseudo-shape:

```ts
function bindAction(fn, store, actionPath) {
  return function boundAction(...args) {
    if (store.activeTransaction) {
      return fn(...args)
    }

    return runRootTransaction(store, actionPath, () => fn(...args))
  }
}
```

## 9.5 Root helpers

`merge()` and `draft()` are wrappers around `runRootTransaction(...)`.

---

# 10. Error handling and invariants

## 11.1 Required invariants

1. **Snapshots are immutable once published**
2. **All committed writes are atomic at the root level**
3. **Nested action calls participate in one root transaction**
4. **Thrown errors publish no partial state**
5. **Actions are synchronous only**
6. **Bound actions are stable for the lifetime of a store instance**
7. **The action factory runs once per store instance**

## 11.2 Development-mode guards

Recommended development checks:

* mutation attempt against a snapshot throws
* action returns Promise throws or warns
* draft proxy access outside active transaction throws
* `useActions()` with a state snapshot from the wrong store instance throws
* duplicate reserved root helper names throw

---

# 11. Edge cases and recommended decisions

## 11.1 Name collisions with root helpers

Because the returned actions object also exposes `merge()` and `draft()`, reserve those names at the root.

Recommended rule:

* root action namespaces may not define `merge` or `draft`
* throw during action blueprint creation if they do

## 11.2 Accessing draft proxy outside transactions

This should be a development error.

Example invalid usage:

```ts
const AppActions = createActions(AppState, (draft) => {
  console.log(draft.foo.bar)
  return { ... }
})
```

Rationale:

* The draft proxy is meaningful only during an active transaction.
* Reading it at initialization time is a logic error.

## 11.3 No-op transactions

If a transaction produces no changes, the library may skip publish and subscriber notification.

Recommended behavior:

* no new snapshot identity
* no subscriber notification

## 11.4 Re-entrancy

A bound action called during an active transaction joins that transaction. The store should not attempt nested Immer roots.

## 11.5 Cross-store misuse

If `AppActions` or bound actions are used with the wrong store instance, fail loudly in development.

---

# 12. Example end-to-end usage

```ts
// AppState.ts
export type Foo = {
  bar: number
}

export type User = null | {
  id: string
  name: string
}

export type Feed = {
  items: string[]
}

export type AppState = {
  foo: Foo
  user: User
  feed: Feed
}

export const AppStateTree = createStateTree<AppState>({
  foo: { bar: 1 },
  user: null,
  feed: {
    items: [],
  },
})
```

```ts
// AppActions.ts
export const AppActions = createActions(AppStateTree, (draft) => {
  const feed = {
    reset() {
      draft.feed.items = []
    },
    addItem(item: string) {
      draft.feed.items.push(item)
    },
  }

  const auth = {
    logOut() {
      draft.user = null
      feed.reset()
    },
  }

  const foo = {
    incrementBar() {
      draft.foo.bar++
    },
  }

  return {
    auth,
    feed,
    foo,
  }
})
```

```tsx
// App.tsx
import type { Foo } from './AppState'

function FooPanel(props: {
  foo: Foo
  onIncrement(): void
}) {
  return (
    <button onClick={props.onIncrement}>
      {props.foo.bar}
    </button>
  )
}

export function App() {
  const state = useStateTree(AppState)
  const actions = useActions(AppActions, state)

  return (
    <div>
      <FooPanel
        foo={state.foo}
        onIncrement={() => actions.foo.incrementBar()}
      />
      <button onClick={() => actions.merge({ foo: { bar: 2 } })}>
        Merge
      </button>
      <button
        onClick={() =>
          actions.draft((draft) => {
            draft.foo.bar++
          })
        }
      >
        Draft
      </button>
      <button onClick={() => actions.auth.logOut()}>
        Log out
      </button>
    </div>
  )
}
```

---

# 13. Pseudocode for root transaction execution

```ts
function runRootTransaction<S>(
  store: StoreInstance<S, any>,
  actionPath: string,
  fn: () => void,
) {
  const baseSnapshot = store.currentSnapshot

  const tx: TransactionContext<S> = {
    rootDraft: createImmerDraft(baseSnapshot),
    depth: 1,
    rootActionName: actionPath,
    startTime: performance.now(),
    mutationCount: 0,
  }

  store.activeTransaction = tx

  try {
    fn()
    const nextSnapshot = finishImmerDraft(tx.rootDraft)
    store.activeTransaction = null

    if (nextSnapshot !== baseSnapshot) {
      store.currentSnapshot = nextSnapshot
      notifySubscribers(store)
    }
  } catch (error) {
    store.activeTransaction = null
    throw error
  }
}
```

This pseudocode is schematic only.

---

# 14. Open questions for implementation review

These do not block the core design but should be decided before implementation.

1. **Should no-op transactions notify subscribers?**
   Recommendation: no.

2. **Should `merge()` be implemented as recursive assignment into the draft or as an Immer producer helper?**
   Recommendation: recursive assignment into the transaction draft.

3. **Should published snapshots be frozen in development only or always?**
   Recommendation: always immutable by contract, with aggressive freezing at least in development.

4. **Should `useActions()` eventually omit the `state` parameter?**
   Current design says no. Keep it for store ownership clarity.

---

# 15. Final recommendation

Proceed with implementation around the following core contract:

* `createStateTree()` creates reusable blueprints.
* `createActions()` initializes once per store instance using a stable root-draft proxy.
* `useStateTree()` returns immutable snapshots and subscribes to all commits.
* `useActions()` returns a stable bound actions object for the owning store instance.
* Every root write is a single atomic transaction over one Immer root draft.
* `merge()` and `draft()` are explicit root helpers for imperative writes.
* Async work stays outside actions.

This contract is small, coherent, and consistent with the library’s goals: simple SPA state, fast prototyping, Immer ergonomics, and an idiomatic style that both humans and agents can apply reliably.

