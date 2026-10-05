import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      invoiceId,
      shippingSelection,
      shippingCost,
      grandTotal,
      status,
    } = req.body || {};

    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    const updates = {
      shipping_selection: shippingSelection || {},
      shipping_cost: Number(shippingCost || 0),
      grand_total: Number(grandTotal || 0),
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;

    const { error } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', String(invoiceId));

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('update-shipping error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
