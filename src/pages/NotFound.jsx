import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="font-mono text-4xl font-bold text-olive-400">404</p>
      <h2 className="mt-2 text-lg font-bold text-slate-100">Page not found</h2>
      <p className="mt-2 text-sm text-slate-400">That route does not exist in the command system.</p>
      <Link to="/" className="btn-primary mt-5">Return to dashboard</Link>
    </div>
  );
}
