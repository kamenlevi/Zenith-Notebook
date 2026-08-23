import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render error used to leave a blank black page with no explanation and no
 * way back — with the user's work still sitting safely in storage, unreachable.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Zenith Notebook crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-400">
            Your notebooks are saved locally and were not affected. Reloading usually clears this.
          </p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-red-300">
            {error.message}
          </pre>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-white"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
