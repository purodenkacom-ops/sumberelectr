import midtransClient from 'midtrans-client';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { invoiceId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION || 'false') === 'true';
    const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY_SANDBOX;
    if (!serverKey) return res.status(500).json({ error: 'MIDTRANS server key missing' });

    const snap = new midtransClient.Snap({ isProduction, serverKey });

    const { data: inv, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', String(invoiceId))
      .maybeSingle();

    if (invError || !inv) return res.status(404).json({ error: 'Invoice not found' });

    const items = Array.isArray(inv.items) ? inv.items : [];
    const sanitizeName = (n) => {
      const s = String(n || 'Item');
      return s.length > 50 ? s.slice(0, 50) : s;
    };
    const item_details = items.map((it) => ({
      id: String(it.productId || it.id || 'item'),
      price: Math.round(Number(it.price) || 0),
      quantity: Math.max(1, Number(it.quantity) || 1),
      name: sanitizeName(it.name)
    }));

    const shippingCost = Math.round(Number(inv.shipping_cost || inv.shippingCost || 0));
    if (shippingCost > 0) {
      item_details.push({
        id: 'SHIPPING_FEE',
        price: shippingCost,
        quantity: 1,
        name: 'Ongkos Kirim'
      });
    }

    const discountAmount = Math.round(Number(inv.discount_amount || inv.discountAmount || 0));
    if (discountAmount > 0) {
      item_details.push({
        id: 'DISCOUNT',
        price: -discountAmount,
        quantity: 1,
        name: 'Diskon Voucher'
      });
    }

    const gross_amount = Math.round(Number(inv.grand_total || inv.grandTotal || 0));
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const order_id = `${invoiceId}-${randomSuffix}`;

    const parameter = {
      transaction_details: {
        order_id,
        gross_amount
      },
      item_details,
      customer_details: {
        first_name: inv.buyer_name || inv.buyerName || 'Customer',
        email: inv.buyer_email || inv.buyerEmail || undefined,
        phone: inv.buyer_phone || inv.buyerPhone || undefined,
      }
    };

    const transaction = await snap.createTransaction(parameter);

    await supabaseAdmin.from('invoices').update({
      midtrans: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
        order_id,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', String(invoiceId));

    return res.status(200).json({
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      order_id
    });
  } catch (e) {
    console.error('Midtrans create-transaction error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
