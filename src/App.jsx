import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ROLES } from './context/AuthContext.jsx';
import Assignments from './pages/Assignments.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Purchases from './pages/Purchases.jsx';
import Transfers from './pages/Transfers.jsx';

/**
 * Route table. The `roles` prop mirrors the API's authorizeRoles for each area — the client
 * guard is for navigation, the server guard is the actual control.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="transfers" element={<Transfers />} />
        <Route
          path="assignments"
          element={(
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.BASE_COMMANDER]}>
              <Assignments />
            </ProtectedRoute>
          )}
        />
        <Route
          path="audit-logs"
          element={(
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AuditLogs />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
