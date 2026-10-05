import { useState, useEffect } from 'react';

/**
 * Hook to fetch categories via internal API route.
 * Never calls Supabase directly from browser.
 */
export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function fetchCategories() {
      try {
        setLoading(true);
        const res = await fetch('/api/categories');
        if (!res.ok) throw new Error('Failed to fetch categories');
        const json = await res.json();
        if (mounted) setCategories(json.categories || []);
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchCategories();
    return () => { mounted = false; };
  }, []);

  return { categories, loading, error };
}
