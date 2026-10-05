import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabase';

const DiscountContext = createContext({
  map: {},
  getFor: () => 0
});

export function DiscountProvider({ children }) {
  const [map, setMap] = useState({});

  useEffect(() => {
    supabase.from('categories')
      .select('slug, discount_percent, discount_active, discount_start, discount_end')
      .eq('discount_active', true)
      .then(({ data }) => {
        if (!data) { setMap({}); return; }
        const now = new Date();
        const m = {};
        data.forEach(cat => {
          const slug = (cat.slug || '').toLowerCase();
          if (!slug) return;
          const percent = Number(cat.discount_percent) || 0;
          if (percent <= 0) return;
          // Check time range if set
          if (cat.discount_start || cat.discount_end) {
            const start = cat.discount_start ? new Date(cat.discount_start) : null;
            const end = cat.discount_end ? new Date(cat.discount_end) : null;
            if (start && now < start) return;
            if (end && now > end) return;
          }
          m[slug] = percent;
        });
        setMap(m);
      })
      .catch(() => setMap({}));
  }, []);

  const api = useMemo(() => ({
    map,
    getFor: (key) => {
      if (!key) return 0;
      const k = key.toString().toLowerCase();
      return Number(map[k]) || 0;
    }
  }), [map]);

  return (
    <DiscountContext.Provider value={api}>
      {children}
    </DiscountContext.Provider>
  );
}

export function useDiscounts() {
  return useContext(DiscountContext);
}
