# immili

## Purpose

Minimal Immer-first local state for React applications with one root state tree, immutable snapshot reads, and synchronous atomic writes.

## Installation

```sh
pnpm add immili react
```

## Quick Example

```tsx
import { createActions, createStateTree, useActions, useStateTree } from 'immili'

const AppStateTree = createStateTree({
  counter: { value: 1 },
})

const AppActions = createActions(AppStateTree, (draft) => ({
  counter: {
    increment() {
      draft.counter.value++
    },
  },
}))

export function Counter() {
  const state = useStateTree(AppStateTree)
  const actions = useActions(AppActions, state)

  return (
    <button onClick={() => actions.counter.increment()}>
      {state.counter.value}
    </button>
  )
}
```

## Documentation Map

- Conceptual model and recommended patterns: [docs/context.md](docs/context.md)
- Canonical usage example: [examples/basic-react.tsx](examples/basic-react.tsx)
- Exact exported signatures: [dist/index.d.mts](dist/index.d.mts)
