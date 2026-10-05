import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { db } from '@/db';
import { invoices, webhookLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

function mapLegacyStatus(s) {
  const S = (s || '').toUpperCase();
  if (S === 'PAID') return 'paid';
  if (S === 'EXPIRED') return 'expired';
  if (S === 'SETTLED') return 'paid';
  if (S === 'PENDING') return 'pending';
  if (S === 'FAILED' || S === 'CANCELLED' || S === 'CANCELED') return 'cancelled';
  return S.toLowerCase() || 'pending';
}

function mapPaymentRequestStatus(eventType, statusRaw) {
  const E = (eventType || '').toLowerCase();
  const S = (statusRaw || '').toUpperCase();
  if (E === 'payment.succeeded' || S === 'SUCCEEDED') return 'paid';
  if (E === 'payment.failed' || S === 'FAILED') return 'cancelled';
  if (E === 'payment.expired' || S === 'EXPIRED') return 'expired';
  if (S === 'PENDING' || S === 'REQUIRES_ACTION') return 'pending';
  return 'pending';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const headers = Object.fromEntries(Object.entries(req.headers).map(([k,v]) => [k, Array.isArray(v)?v.join(','):v]));
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN || process.env.XENDIT_WEBHOOK_TOKEN;
  const gotToken = headers['x-callback-token'] || headers['x-xendit-callback-token'];
  if (expectedToken && gotToken !== expectedToken) {
    return res.status(403).json({ error: 'Invalid callback token' });
  }

  const payload = req.body || {};
  let invoiceId = payload.external_id || payload.data?.reference_id || payload.id;
  const eventType = payload.event || headers['x-event-type'];
  const statusRaw = payload.status || payload.data?.status;

  let finalStatus;
  if (eventType || (payload.data && payload.data.status)) {
    finalStatus = mapPaymentRequestStatus(eventType, statusRaw);
  } else {
    finalStatus = mapLegacyStatus(statusRaw);
  }

  try {
    // Log webhook
    if (db) {
      await db.insert(webhookLogs).values({
        id: String(Date.now() + Math.random()),
        provider: 'xendit',
        payload,
      });
    }

    if (invoiceId && finalStatus) {
      if (db) {
        await db.update(invoices).set({
          status: finalStatus,
          paymentGateway: 'xendit',
          updatedAt: new Date(),
        }).where(eq(invoices.id, String(invoiceId)));
      } else {
        await supabaseAdmin.from('invoices').update({
          status: finalStatus,
          payment_gateway: 'xendit',
          updated_at: new Date().toISOString(),
        }).eq('id', String(invoiceId));
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Xendit webhook error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
