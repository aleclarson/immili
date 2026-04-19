import { createActions, createStateTree, useActions, useStateTree } from 'immili'

type Counter = {
  value: number
}

type Feed = {
  items: string[]
}

type User = {
  id: string
  name: string
}

type AppState = {
  counter: Counter
  feed: Feed
  user: User | null
}

export const AppState = createStateTree<AppState>({
  counter: { value: 1 },
  feed: { items: [] },
  user: { id: '1', name: 'Ada' },
})

export const AppActions = createActions(AppState, (draft) => {
  const feed = {
    reset() {
      draft.feed.items = []
    },
    add(item: string) {
      draft.feed.items.push(item)
    },
  }

  return {
    auth: {
      logOut() {
        draft.user = null
        feed.reset()
      },
    },
    counter: {
      increment() {
        draft.counter.value++
      },
    },
    feed,
  }
})

export function App() {
  const state = useStateTree(AppState)
  const actions = useActions(AppActions, state)

  return (
    <main>
      <button onClick={() => actions.counter.increment()}>Count: {state.counter.value}</button>
      <button
        onClick={() =>
          actions.draft((draft) => {
            draft.feed.items.push(`item-${draft.feed.items.length + 1}`)
          })
        }
      >
        Items: {state.feed.items.length}
      </button>
      <button onClick={() => actions.auth.logOut()}>
        {state.user ? `Log out ${state.user.name}` : 'Logged out'}
      </button>
    </main>
  )
}
