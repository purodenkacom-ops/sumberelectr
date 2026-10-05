import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    if (!['GET', 'POST'].includes(method)) return res.status(405).json({ error: 'Method not allowed' });
    const invoiceId = method === 'GET' ? (req.query.invoiceId || req.query.id) : (req.body?.invoiceId || req.body?.id);
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', String(invoiceId))
      .maybeSingle();

    if (error || !data) return res.status(404).json({ error: 'Invoice not found' });

    return res.status(200).json(data);
  } catch (e) {
    console.error('invoices/get error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
