import { Component } from 'react';

/**
 * React unmounts the whole tree when render throws, leaving a blank page. Keep something on
 * screen and name the error instead.
 */
export default class ErrorBoundary extends Component {
  state = { message: '' };

  static getDerivedStateFromError(error) {
    // A non-string message is what blanks the page; never pass one on.
    const message = error?.message;
    return { message: typeof message === 'string' && message ? message : 'Something went wrong.' };
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
        <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
