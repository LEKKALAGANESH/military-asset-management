import { Component } from 'react';

/**
 * A throw during render unmounts the entire tree and React's default is a blank page — the least
 * useful failure report there is. This keeps something on screen and names the error, so a broken
 * deploy reads as a broken deploy rather than as nothing at all.
 *
 * The message is coerced to a string on the way in: the boundary must survive being handed a
 * non-string `error.message`, which is the exact defect that blanked this app in the first place.
 */
export default class ErrorBoundary extends Component {
  state = { message: '' };

  static getDerivedStateFromError(error) {
    const raw = error?.message;
    return { message: typeof raw === 'string' && raw ? raw : 'Something went wrong.' };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.message) return this.props.children;

    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <p className="font-mono text-4xl font-bold text-olive-400">!</p>
        <h2 className="mt-2 text-lg font-bold text-slate-100">Something went wrong</h2>
        <p className="mt-2 break-words text-sm text-slate-400">{this.state.message}</p>
        <button
          type="button"
          className="btn-primary mt-5"
          onClick={() => window.location.reload()}
        >
          Reload the page
        </button>
      </div>
    );
  }
}
