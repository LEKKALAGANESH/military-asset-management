import { useEffect, useState } from 'react';
import api from '../services/api.js';
import Banner from './Banner.jsx';

/**
 * From the sign-in form a dead API and an empty database both look like a rejected password, and
 * they need different fixes. `/api/health` separates them before the user spends a password.
 */
export default function ApiStatusBanner() {
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.get('/health').catch((error) => {
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
