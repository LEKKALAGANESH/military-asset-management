import { useEffect, useState } from 'react';
import api from '../services/api.js';
import Banner from './Banner.jsx';

/**
 * Reports a broken deployment before the user spends a password on it.
 *
 * `/api/health` distinguishes the two failures that look identical from the sign-in form — the
 * function never answering, and the function answering against a database with no schema — so
 * each gets the fix that actually applies instead of "Invalid username or password."
 */
export default function ApiStatusBanner() {
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.get('/health')
      .then(() => !cancelled && setProblem(''))
      .catch((error) => {
        if (cancelled) return;
        const schema = error.response?.data?.schema;
        setProblem(schema && schema !== 'ready'
          ? 'The database is reachable but has no schema. Apply it with `npm run db:reset`.'
          : error.message);
      });

    return () => { cancelled = true; };
  }, []);

  return <Banner tone="error" message={problem} />;
}
