import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ categories: data || [] });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
