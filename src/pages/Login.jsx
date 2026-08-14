import { Loader2, Shield } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ApiStatusBanner from '../components/ApiStatusBanner.jsx';
import Banner from '../components/Banner.jsx';
import Field from '../components/Field.jsx';
import { LoadingState } from '../components/States.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Seeded accounts, offered as one-click fills so RBAC can be demonstrated without retyping.
const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin_user', password: 'AdminPass123!', scope: 'All bases' },
  { label: 'Base Commander', username: 'commander_alpha', password: 'CommandPass123!', scope: 'Fort Alpha' },
  { label: 'Logistics Officer', username: 'logistics_officer', password: 'LogisticsPass123!', scope: 'Fort Alpha' },
];

export default function Login() {
  const { user, bootstrapping, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(searchParams.get('expired') ? 'Your session expired. Please sign in again.' : '');
  const [submitting, setSubmitting] = useState(false);

  if (bootstrapping) return <LoadingState label="Restoring session…" />;
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return; // Guards the double-click / double-submit case.

    setSubmitting(true);
    setError('');
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-night-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-olive-600/20 text-olive-400">
            <Shield size={28} aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold text-slate-50">Military Asset Management</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to access the command dashboard</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
          <ApiStatusBanner />
          <Banner tone="error" message={error} />

          <Field label="Username" required>
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="username"
                autoFocus
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="admin_user"
              />
            )}
          </Field>

          <Field label="Password" required>
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
              />
            )}
          </Field>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <section className="card mt-4 p-4" aria-label="Demonstration accounts">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Demonstration accounts
          </h2>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.username}>
                <button
                  type="button"
                  onClick={() => setForm({ username: account.username, password: account.password })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-night-700 px-3 py-2 text-left text-xs hover:bg-night-800"
                >
                  <span>
                    <span className="block font-semibold text-slate-200">{account.label}</span>
                    <span className="font-mono text-[11px] text-slate-500">{account.username}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{account.scope}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
