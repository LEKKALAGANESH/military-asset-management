import { LogOut, Menu, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';

export default function Navbar({ onOpenSidebar, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-night-700 bg-night-900/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="rounded-lg p-1.5 text-slate-300 hover:bg-night-800 lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <h1 className="flex-1 truncate text-base font-bold text-slate-100 sm:text-lg">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight text-slate-100">{user?.fullName}</p>
          <p className="text-xs text-slate-400">
            {ROLE_LABELS[user?.role] ?? user?.role}
            {user?.baseName ? ` · ${user.baseName}` : ' · Global'}
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-olive-600/20 text-olive-400" aria-hidden="true">
          <UserRound size={18} />
        </span>
        <button type="button" onClick={signOut} className="btn-ghost !px-3" title="Sign out">
          <LogOut size={16} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Sign out</span>
        </button>
      </div>
    </header>
  );
}
