import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState } from './States.jsx';

/**
 * Waits for the session to resolve, so a refresh doesn't bounce an authenticated user to
 * login before /auth/me answers. `roles` mirrors the server's gate — the API rejects the
 * call regardless; this only avoids landing the user on a page they can't use.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, bootstrapping } = useAuth();
  const location = useLocation();

  if (bootstrapping) return <LoadingState label="Restoring session…" />;

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center" role="alert">
        <h2 className="text-lg font-bold text-slate-100">Access denied</h2>
        <p className="mt-2 text-sm text-slate-400">
          Your role ({user.role}) is not authorised to view this page.
        </p>
      </div>
    );
  }

  return children;
}
