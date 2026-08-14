import {
  ArrowLeftRight,
  ClipboardList,
  LayoutDashboard,
  ScrollText,
  ShoppingCart,
  Shield,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROLES, useAuth } from '../context/AuthContext.jsx';

// Hiding a link is convenience, not control — the server rejects the call regardless.
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: Object.values(ROLES), end: true },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart, roles: Object.values(ROLES) },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight, roles: Object.values(ROLES) },
  { to: '/assignments', label: 'Assignments', icon: ClipboardList, roles: [ROLES.ADMIN, ROLES.BASE_COMMANDER] },
  { to: '/audit-logs', label: 'Audit Trail', icon: ScrollText, roles: [ROLES.ADMIN] },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  return (
    <>
      {/* Drawer backdrop, small screens only. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-night-700 bg-night-900
                    transition-transform lg:static lg:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-night-700 px-4 py-4">
          <div className="flex items-center gap-2">
            <Shield size={22} className="text-olive-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold leading-tight text-slate-100">MAMS</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Asset Command</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close navigation" className="p-1 text-slate-400 lg:hidden">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-olive-600/20 text-olive-400' : 'text-slate-300 hover:bg-night-800'
                }`}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-night-700 px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Access scope</p>
          <p className="mt-1 text-xs font-medium text-slate-300">
            {user?.role === ROLES.ADMIN ? 'All bases (global)' : user?.baseName || 'Assigned base'}
          </p>
        </div>
      </aside>
    </>
  );
}
