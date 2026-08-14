import { useEffect, useState } from 'react';
import api from '../services/api.js';

// Shared across every mount: five pages loading at once still make one request.
let cached = null;

export default function useMeta() {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    cached ??= api.get('/meta').then(({ data }) => data);

    cached
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((error) => {
        cached = null; // Let the next mount retry.
        if (active) setState({ data: null, loading: false, error: error.message });
      });

    return () => { active = false; };
  }, []);

  const bases = state.data?.bases ?? [];
  const equipmentTypes = state.data?.equipmentTypes ?? [];

  return {
    bases,
    equipmentTypes,
    baseOptions: bases.map((base) => ({ value: base.id, label: base.name })),
    equipmentOptions: equipmentTypes.map((type) => ({
      value: type.id,
      label: `${type.name} (${type.category})`,
    })),
    loading: state.loading,
    error: state.error,
  };
}
