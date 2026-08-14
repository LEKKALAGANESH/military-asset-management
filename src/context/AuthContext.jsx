import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../services/api.js';

const AuthContext = createContext(null);

export const ROLES = {
  ADMIN: 'ADMIN',
  BASE_COMMANDER: 'BASE_COMMANDER',
  LOGISTICS_OFFICER: 'LOGISTICS_OFFICER',
};

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  BASE_COMMANDER: 'Base Commander',
  LOGISTICS_OFFICER: 'Logistics Officer',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Gates the router: without it a refresh flashes login and deep links redirect wrongly.
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setBootstrapping(false);
      return;
    }

    // Re-read so a revoked account or changed role takes effect without a new sign-in.
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setBootstrapping(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    bootstrapping,
    login,
    logout,
    isAdmin: user?.role === ROLES.ADMIN,
    // Only an Admin may act outside a single base.
    canPickBase: user?.role === ROLES.ADMIN,
    can: (...roles) => Boolean(user && roles.includes(user.role)),
  }), [user, bootstrapping, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
