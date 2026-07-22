import midtransClient from 'midtrans-client';
import { adminDb } from '@/utils/firebaseAdmin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { invoiceId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION || 'false') === 'true';
    const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY_SANDBOX;
    if (!serverKey) return res.status(500).json({ error: 'MIDTRANS server key missing' });

    const snap = new midtransClient.Snap({ isProduction, serverKey });

    // Fetch invoice
    const invSnap = await adminDb.collection('invoices').doc(String(invoiceId)).get();
    if (!invSnap.exists) return res.status(404).json({ error: 'Invoice not found' });
    const inv = invSnap.data();

    // Build item_details and compute sum for Midtrans

    const items = Array.isArray(inv.items) ? inv.items : [];
    const sanitizeName = (n) => {
      const s = String(n || 'Item');
      return s.length > 50 ? s.slice(0, 50) : s; // Midtrans limit
    };
    const item_details = items.map((it) => ({
      id: String(it.productId || it.id || 'item'),
      price: Math.round(Number(it.price) || 0),
      quantity: Math.max(1, Number(it.quantity) || 1),
      name: sanitizeName(it.name)
    }));

    // Add shipping as an item for clarity
    const shippingPrice = Number(inv.shippingSelection?.price || inv.shippingCost || 0);
    if (shippingPrice > 0) {
      item_details.push({ id: 'shipping', price: Math.round(shippingPrice), quantity: 1, name: 'Shipping' });
    }

    // Add payment fee if present
    const transferFee = Number(inv.transferFee || 0);
    if (transferFee > 0) {
      item_details.push({ id: 'payment_fee', price: Math.round(transferFee), quantity: 1, name: 'Payment Fee' });
    }

    // Ensure gross_amount equals the sum of item_details
    const grossAmount = item_details.reduce((sum, it) => sum + (Math.round(Number(it.price)) * Math.max(1, Number(it.quantity))), 0);
    if (!grossAmount || grossAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Ensure unique order_id per transaction attempt to avoid reuse error
    const baseId = String(inv.invoiceId || invoiceId);
    // Add random suffix to avoid millisecond-collision and prior reuse
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const orderId = `${baseId}-${Date.now()}-${randomSuffix}`;

    const customer_details = {
      first_name: inv.buyerName || 'Buyer',
      email: inv.buyerEmail || undefined,
      phone: inv.buyerPhone || undefined,
      billing_address: {
        address: inv.buyerAddress || inv.shippingAddress?.address || '',
        city: inv.shippingAddress?.city || '',
        postal_code: String(inv.shippingAddress?.postal_code || '')
      },
      shipping_address: {
        address: inv.shippingAddress?.address || '',
        city: inv.shippingAddress?.city || '',
        postal_code: String(inv.shippingAddress?.postal_code || '')
      }
    };

    const transaction = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount
      },
      item_details,
      customer_details,
      credit_card: { secure: true },
      callbacks: {
        finish: `${req.headers.origin || process.env.NEXT_PUBLIC_BASE_URL || ''}/account`
      }
    };

    const response = await snap.createTransaction(transaction);

    // Store token & redirect_url
    await adminDb.collection('invoices').doc(String(invoiceId)).update({
      paymentMethod: 'midtrans',
      'midtrans.order_id': orderId,
      'midtrans.token': response.token,
      'midtrans.redirect_url': response.redirect_url,
      updatedAt: new Date()
    });

    return res.status(200).json({ token: response.token, redirect_url: response.redirect_url });
  } catch (e) {
    console.error('midtrans/create-transaction error', e.response?.data || e);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: e.response?.data || e.message || String(e)
    });
  }
}
