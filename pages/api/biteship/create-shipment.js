import { supabaseAdmin } from '@/utils/supabaseAdmin';
import axios from 'axios';

export default async function handler(req,res){
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const { invoiceId, force } = req.body || {};
    if(!invoiceId) return res.status(400).json({error:'invoiceId required'});

    const { data: inv, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', String(invoiceId))
      .maybeSingle();

    if (invError || !inv) return res.status(404).json({error:'Invoice not found'});

    if (inv.biteship?.order_id && !force) {
      return res.status(200).json({
        success: true,
        alreadyCreated: true,
        biteship: inv.biteship
      });
    }

    const apiKey = process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Biteship API key not configured' });

    const originAreaId = process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_AREA_ID || 'IDNP6IDNC147IDND834IDZ10410';
    const sa = inv.shipping_address || inv.shippingAddress || {};
    const sel = inv.shipping_selection || inv.shippingSelection || {};
    const courierCompany = sel.courier_company || sel.company || 'jne';
    const courierType = sel.courier_type || sel.type || 'reg';

    const items = (Array.isArray(inv.items) ? inv.items : []).map(it => ({
      name: it.name || 'Produk',
      description: it.name || 'Produk',
      value: Math.round(Number(it.price) || 10000),
      quantity: Math.max(1, Number(it.quantity) || 1),
      weight: Math.max(100, Math.round(Number(it.weight || 500))),
    }));

    const payload = {
      shipper_contact_name: 'Purodenka',
      shipper_contact_phone: '081234567890',
      origin_contact_name: 'Purodenka Warehouse',
      origin_contact_phone: '081234567890',
      origin_address: process.env.BITESHIP_ORIGIN_ADDRESS || 'Jakarta',
      origin_area_id: originAreaId,
      destination_contact_name: inv.buyer_name || inv.buyerName || 'Customer',
      destination_contact_phone: inv.buyer_phone || inv.buyerPhone || '081234567890',
      destination_address: sa.address || sa.fullAddress || 'Alamat',
      destination_area_id: sa.area_id || sa.areaId || originAreaId,
      courier_company: courierCompany,
      courier_type: courierType,
      delivery_type: 'now',
      items,
    };

    const biteshipRes = await axios.post('https://api.biteship.com/v1/orders', payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const bsData = biteshipRes.data;

    await supabaseAdmin.from('invoices').update({
      biteship: bsData,
      status: 'shipped',
      updated_at: new Date().toISOString(),
    }).eq('id', String(invoiceId));

    return res.status(200).json({ success: true, biteship: bsData });
  } catch (err) {
    console.error('Biteship create-shipment error:', err?.response?.data || err.message);
    return res.status(500).json({ error: err?.response?.data?.message || err.message });
  }
}
