import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode }, { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[sanket] boundary caught:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <div className="kicker justify-center">Sanket</div>
          <h1 className="display mt-4 text-3xl font-extrabold text-[var(--ink)]">
            Could not display this view.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--ink-dim)]">
            Reload the app to try again. Check the local server if this keeps happening.
          </p>
          <button onClick={() => location.reload()}
            className="mt-6 rounded-full bg-[var(--lime)] px-6 py-3 text-sm font-bold text-[#111] transition-transform hover:scale-105">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
