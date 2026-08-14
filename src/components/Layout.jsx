import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

const TITLES = {
  '/': 'Command Dashboard',
  '/purchases': 'Purchases',
  '/transfers': 'Transfers',
  '/assignments': 'Assignments & Expenditures',
  '/audit-logs': 'Audit Trail',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen bg-night-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* min-w-0: stops a wide table forcing the page to scroll sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onOpenSidebar={() => setSidebarOpen(true)} title={TITLES[pathname] ?? 'MAMS'} />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
