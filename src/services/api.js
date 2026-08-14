import axios from 'axios';

export const TOKEN_KEY = 'mams.token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Turns a rejected token into a clean sign-out, and flattens every failure shape (error body,
 * timeout, no response) into one `error.message` the UI can render directly.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      // Full reload clears every cached view from the previous session.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1');
      }
    }

    error.message = error.response?.data?.error
      || (error.code === 'ECONNABORTED' ? 'The request timed out. Please try again.' : null)
      || (error.response ? `Request failed (${status}).` : 'Cannot reach the server. Is the API running?');

    return Promise.reject(error);
  },
);

/** Drops empty values so the API sees an absent filter, not an empty string. */
export const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );

export default api;
