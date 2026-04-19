# Overview

`immili` is a minimal Immer-first local state library for React applications.

It assumes one root state tree per mounted app root, immutable snapshot reads, and synchronous mutations that always run inside a single root transaction. Any successful commit re-renders every component subscribed to that store instance.

# When to Use

- You want one small local-state model for a simple React SPA.
- Your updates are easier to express as direct draft mutation than reducers.
- Coarse invalidation is acceptable.
- You want named synchronous actions for business logic and explicit root helpers for one-off writes.

# When Not to Use

- You need fine-grained subscriptions or selector invalidation.
- Your local state is split across many independently mounted stores.
- You want async actions that hold mutation context across `await`.
- You want this library to manage server fetching, caching, retries, or invalidation.

# Core Abstractions

- `createStateTree(initialState)`: defines a reusable root-state blueprint.
- `createActions(stateTree, factory)`: defines a reusable action blueprint for that state tree.
- `useStateTree(stateTree)`: returns the current immutable root snapshot for the mounted store instance.
- `useActions(actionTree, state)`: returns the stable bound actions object for the store instance that owns `state`.
- `actions.merge(patch)`: applies a deep root patch where plain objects recurse and arrays replace.
- `actions.draft(producer)`: performs an imperative root mutation against the current transaction draft.

# Data Flow / Lifecycle

1. Define the root state shape with `createStateTree()`.
2. Define synchronous named actions with `createActions()`.
3. In the mounted root component, call `useStateTree()` and then `useActions()`.
4. Components read from the immutable `state` snapshot.
5. Any bound action, `merge()`, or `draft()` call starts a root transaction when none is active.
6. Nested action calls join the same transaction.
7. On success, the transaction publishes one new root snapshot. On error, it publishes nothing.

# Common Tasks -> Recommended APIs

- Define local application state: `createStateTree()`
- Define business logic that spans multiple writes: `createActions()`
- Read current state in React: `useStateTree()`
- Access stable store-bound methods in React: `useActions()`
- Apply an obvious structural patch: `actions.merge()`
- Perform a one-off imperative mutation: `actions.draft()`

# Recommended Patterns

- Read from `state` as close as possible to where values are rendered.
- Prefer named actions for domain logic and multi-step writes.
- Pass focused state namespaces to child components instead of the entire root state object.
- Pass `actions` through React context when deeply nested components only need to trigger behavior.
- Keep server state outside `immili`, such as in TanStack Query.
- Keep domain type aliases non-nullable when possible, and model nullable slots at the property site, such as `user: User | null`.

# Patterns to Avoid

- Passing the full root `state` object deep through the component tree.
- Mutating snapshots directly.
- Returning promises from actions or placing `await` inside them.
- Expecting selector-based or property-level subscription behavior.
- Baking `| null` into a domain type alias when the nullability belongs to a specific root property.

# Invariants and Constraints

- Published snapshots are immutable.
- Every successful root write produces at most one commit.
- Nested action calls share one root transaction.
- No partial state is published when an action throws.
- Bound actions stay stable for the lifetime of a `useActions()` call while its `state` and `actionTree` continue to target the same store instance.
- `useActions()` requires a snapshot from the matching mounted store instance.

# Error Model

- Accessing the action-factory draft proxy outside an active transaction throws.
- Returning a promise from an action throws.
- Binding actions with a snapshot from the wrong state tree throws.
- Errors raised during a root transaction roll back the whole transaction and notify no subscribers.

# Terminology

- State tree: the reusable blueprint created by `createStateTree()`.
- Store instance: the mounted runtime instance that owns the current snapshot and subscriptions.
- Action tree: the reusable blueprint created by `createActions()`.
- Bound actions: the stable store-bound actions object returned by `useActions()`.
- Root transaction: one synchronous mutation session over a single Immer root draft.

# Non-Goals

- Fine-grained subscriptions
- Async action orchestration
- Server-state fetching and caching
- Middleware pipelines
- Persistence and cross-tab synchronization
- SSR-specific optimizations in the initial version
