import { useMemo } from 'react';
import { cleanParams } from '../services/api.js';

/**
 * Turns a filter set into request params plus a stable key.
 *
 * The key is what lets useApi discard a slow response whose filters have since changed.
 */
export default function useFilterParams(filters, extra) {
  const key = JSON.stringify([filters, extra]);
  return useMemo(() => ({ key, params: cleanParams({ ...filters, ...extra }) }), [key]);
}
