import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { generateInvoiceId } from '@/utils/invoice';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      invoiceId: incomingInvoiceId,
      buyerName,
      buyerEmail,
      buyerPhone,
      shippingAddress,
      items,
      gateway = 'xendit',
      guestUid,
      guestSessionId,
    } = req.body || {};

    if (!buyerName || !buyerPhone) {
      return res.status(400).json({ error: 'buyerName and buyerPhone are required' });
    }

    const sa = shippingAddress || {};
    const invoiceId = incomingInvoiceId || generateInvoiceId();
    const cleanItems = (Array.isArray(items) ? items : []).map(it => ({
      productId: it.productId || it.id || '',
      name: it.name || '',
      price: Number(it.price || it.priceRetail || 0),
      quantity: Number(it.quantity || 1),
      weight: Number(it.weight || 0),
      image: it.image || '',
    }));

    const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

    const invoiceRecord = {
      id: String(invoiceId),
      buyer_name: buyerName,
      buyer_email: buyerEmail || null,
      buyer_phone: buyerPhone,
      guest_uid: guestUid || null,
      guest_session_id: guestSessionId || null,
      status: 'draft',
      payment_gateway: gateway,
      items: cleanItems,
      subtotal: subtotal,
      grand_total: subtotal,
      shipping_address: sa,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('invoices').upsert(invoiceRecord);
    if (error) throw error;

    return res.status(200).json({ invoiceId, success: true });
  } catch (err) {
    console.error('create-guest invoice error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
