import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loading/error/data for every view that fetches. A response whose `key` no longer matches
 * the current one is discarded, so a slow earlier request can't overwrite a newer one.
 */
export default function useApi(fetcher, key) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latestKey = useRef(key);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (requestKey) => {
    latestKey.current = requestKey;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (latestKey.current === requestKey) setState({ data, loading: false, error: null });
    } catch (error) {
      if (latestKey.current === requestKey) {
        setState({ data: null, loading: false, error: error.message || 'Something went wrong.' });
      }
    }
  }, []);

  useEffect(() => { run(key); }, [key, run]);

  return { ...state, refetch: () => run(key) };
}
