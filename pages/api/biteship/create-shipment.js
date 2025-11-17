// File: /pages/api/biteship/create-shipment.js

// Create shipment (NON-COD). COD gunakan /api/biteship/create-cod.
// Menangani 2 jenis:
// 1. Reguler (jne, jnt, sicepat, tiki) -> gunakan postal code
// 2. Instant (grab, gojek) -> gunakan koordinat origin + destination
import axios from 'axios';
import { adminDb } from '@/utils/firebaseAdmin';

const REGULAR_COURIERS = ['jne','jnt','sicepat','tiki'];
const INSTANT_COURIERS = ['grab','gojek','lalamove'];

export default async function handler(req,res){
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const { invoiceId, force } = req.body || {};
    if(!invoiceId) return res.status(400).json({error:'invoiceId required'});

    const docRef = adminDb.collection('invoices').doc(String(invoiceId));
    const snap = await docRef.get();
    if(!snap.exists) return res.status(404).json({error:'Invoice not found'});
    const inv = snap.data();

    if(inv.paymentMethod === 'cod'){
      return res.status(400).json({error:'Invoice is COD. Use /api/biteship/create-cod endpoint.'});
    }

    if(!inv.shippingSelection){
      return res.status(400).json({error:'shippingSelection missing on invoice'});
    }

    const shipping = inv.shippingSelection;
    const courier = (shipping.courier || '').toLowerCase();
    if (![...REGULAR_COURIERS, ...INSTANT_COURIERS].includes(courier)){
      return res.status(400).json({error:'Unsupported courier for this endpoint'});
    }

    // Idempoten
    if (inv.biteshipOrderId && !force){
      return res.status(200).json({
        success:true,
        reused:true,
        biteshipOrderId: inv.biteshipOrderId,
        waybillId: inv.waybillId || null,
        status: inv.biteshipStatus || null
      });
    }

    // Items
    // PATCH: Sanitasi category item (hindari "general" -> ganti 'others'; whitelist valid)
    const VALID_CATEGORIES = [
      'fashion','document','food','electronics','health','beauty',
      'auto','baby','book','pet','toys','groceries','accessories','others'
    ];

    const itemsSrc = Array.isArray(inv.items) ? inv.items : [];
    const items = itemsSrc.map((it, idx) => {
      let cat = (it.category || '').toString().trim().toLowerCase();
      if (!cat) cat = 'others';
      // Normalisasi beberapa sinonim
      if (['general','misc','other','lain','lainnya','unknown','-'].includes(cat)) cat = 'others';
      if (!VALID_CATEGORIES.includes(cat)) cat = 'others';
      return {
        name: it.name || `Item ${idx+1}`,
        description: it.description || '',
        category: cat,
        value: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        height: Number(it.height) || 1,
        length: Number(it.length) || 1,
        width: Number(it.width) || 1,
        weight: Number(it.weight) || 100
      };
    });
    if(items.length === 0){
      return res.status(400).json({error:'Invoice has no items'});
    }
    const totalItemsValue = items.reduce((s,x)=> s + x.value * x.quantity, 0);

    // Attempt primary pickup override
    let pickup = null;
    try {
      const settingsSnap = await adminDb.collection('settings').doc('pickups').get();
      const primaryId = settingsSnap.exists ? settingsSnap.data().primaryId : null;
      if (primaryId) {
        const pSnap = await adminDb.collection('pickup_locations').doc(String(primaryId)).get();
        if (pSnap.exists) pickup = pSnap.data();
      }
    } catch (e) {
      // ignore
    }

    // Origin (env-driven) with optional pickup override
    let SHIPPER_NAME  = process.env.BITESHIP_SHIPPER_NAME  || process.env.BITESHIP_ORIGIN_CONTACT_NAME || 'Purodenka';
    let SHIPPER_PHONE = process.env.BITESHIP_SHIPPER_PHONE || process.env.BITESHIP_ORIGIN_CONTACT_PHONE || '089000000000';
    const SHIPPER_EMAIL = process.env.BITESHIP_SHIPPER_EMAIL || process.env.BITESHIP_ORIGIN_CONTACT_EMAIL || 'noreply@purodenka.local';
    const SHIPPER_ORG   = process.env.BITESHIP_SHIPPER_ORG   || process.env.BITESHIP_ORIGIN_ORG || 'Purodenka';

    // If primary pickup is available, prefer its contact info for shipper/origin
    if (pickup) {
      if (pickup.contactName) SHIPPER_NAME = String(pickup.contactName).trim() || SHIPPER_NAME;
      if (pickup.contactPhone) {
        const p = String(pickup.contactPhone).trim();
        // Minimal sanitization: strip spaces; leave formatting to Biteship acceptance
        SHIPPER_PHONE = p || SHIPPER_PHONE;
      }
    }

    const originAddress = pickup?.address ||
      process.env.BITESHIP_ORIGIN_ADDRESS ||
      process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_ADDRESS ||
      'Origin Address';

    const originPostalCode = Number(
      pickup?.postal_code ||
      process.env.BITESHIP_ORIGIN_POSTAL ||
      process.env.BITESHIP_ORIGIN_POSTAL_CODE ||
      process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_POSTAL_CODE ||
      12440
    );

    // Prefer stored pickup.latitude/longitude, fallback to area.lat/lng, then env
    const originLat = (pickup && pickup.latitude != null)
      ? Number(pickup.latitude)
      : (pickup?.area?.lat != null)
        ? Number(pickup.area.lat)
        : parseFloat(process.env.BITESHIP_ORIGIN_LAT || process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT || '');
    const originLng = (pickup && pickup.longitude != null)
      ? Number(pickup.longitude)
      : (pickup?.area?.lng != null)
        ? Number(pickup.area.lng)
        : parseFloat(process.env.BITESHIP_ORIGIN_LNG || process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG || '');

    // Destination
    const destAddr =
      (inv.shippingAddress && inv.shippingAddress.address) ||
      (inv.shippingSelection && inv.shippingSelection.destination_address) ||
      (inv.buyerAddress && (inv.buyerAddress.street || inv.buyerAddress.address)) ||
      inv.destinationAddress ||
      'Alamat Buyer';

    const destPostal = Number(
      (inv.shippingAddress && (inv.shippingAddress.postal_code || inv.shippingAddress.postalCode)) ||
      (inv.shippingSelection && inv.shippingSelection.destination_postal_code) ||
      (inv.buyerAddress && (inv.buyerAddress.postal_code || inv.buyerAddress.postalCode)) ||
      12950
    );
    const destLat = shipping.destination_latitude || shipping.destinationLatitude;
    const destLng = shipping.destination_longitude || shipping.destinationLongitude;

    // Insurance
    const insuranceCap = Number(process.env.BITESHIP_INSURANCE_CAP || 0);
    let courier_insurance = 0;
    if (insuranceCap > 0){
      courier_insurance = Math.min(totalItemsValue, insuranceCap);
    }

    const basePayload = {
      shipper_contact_name: SHIPPER_NAME,
      shipper_contact_phone: SHIPPER_PHONE,
      shipper_contact_email: SHIPPER_EMAIL,
      shipper_organization: SHIPPER_ORG,
      origin_contact_name: SHIPPER_NAME,
      origin_contact_phone: SHIPPER_PHONE,
      order_note: inv.buyerNote || 'Please be careful',
      metadata: {
        invoice_id: invoiceId,
        buyer_id: inv.buyerId || '',
        payment_method: inv.paymentMethod || '',
        voucher_used: !!inv.voucherDiscount
      },
      items,
      courier_insurance: courier_insurance || undefined
    };

    let shipmentData;

    if (REGULAR_COURIERS.includes(courier)){
      // Validasi postal codes
      if(!originPostalCode || !destPostal){
        return res.status(400).json({error:'Missing postal codes for regular courier'});
      }
      shipmentData = {
        ...basePayload,
        origin_address: originAddress,
        origin_note: '',
        origin_postal_code: originPostalCode,
        destination_contact_name: inv.buyerName || 'Buyer',
        destination_contact_phone: inv.buyerPhone || '089000000000',
        destination_contact_email: inv.buyerEmail || 'buyer@example.com',
        destination_address: destAddr,
        destination_postal_code: destPostal,
        destination_note: inv.destinationNote || '',
        courier_company: courier,
        courier_type: shipping.service_code || shipping.service_name || 'reg',
        delivery_type: 'now', // atau 'scheduled' jika Anda ingin dijadwalkan
      };
    } else {
      // INSTANT (grab / gojek) – perlu koordinat
      if (isNaN(originLat) || isNaN(originLng)){
        return res.status(500).json({error:'Origin coordinates not configured (BITESHIP_ORIGIN_LAT/LNG)'});
      }
      if (!destLat || !destLng){
        return res.status(400).json({error:'Destination coordinates missing in shippingSelection (destination_latitude/longitude)'});
      }
      shipmentData = {
        ...basePayload,
        origin_address: originAddress,
        origin_note: '',
        origin_coordinate: {
          latitude: Number(originLat),
            longitude: Number(originLng)
        },
        destination_contact_name: inv.buyerName || 'Buyer',
        destination_contact_phone: inv.buyerPhone || '089000000000',
        destination_contact_email: inv.buyerEmail || 'buyer@example.com',
        destination_address: destAddr,
        destination_note: inv.destinationNote || '',
        destination_coordinate: {
          latitude: Number(destLat),
          longitude: Number(destLng)
        },
        courier_company: courier,
        courier_type: shipping.service_code || shipping.service_name || 'instant',
        delivery_type: 'now'
      };
    }

    const apiKey = process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY;
    if(!apiKey) return res.status(500).json({error:'Missing Biteship API key (set BITESHIP_API_KEY, optionally fallback to NEXT_PUBLIC_BITESHIP_API_KEY in dev)'});

    const resp = await axios.post('https://api.biteship.com/v1/orders', shipmentData, {
      headers:{
        Authorization:`Bearer ${apiKey}`,
        'Content-Type':'application/json'
      },
      timeout: 25000
    });

    let data = resp.data || {};

    // Ambil waybill dari semua kemungkinan field yang dipakai Biteship
    let waybillId =
      data.courier_waybill_id ||
      data.waybill_id ||
      data.courier?.waybill_id ||
      '';

    // Jika masih kosong (sering terjadi untuk reguler sebelum label/alloc), coba retrieve sekali
    if (!waybillId) {
      try {
        const retrieve = await axios.get(`https://api.biteship.com/v1/orders/${encodeURIComponent(data.id)}`, {
          headers:{ Authorization:`Bearer ${apiKey}` },
          timeout: 15000
        });
        const rData = retrieve.data || {};
        // merge minimal field ke data
        data = { ...data, _retrieved: rData };
        waybillId =
          rData.courier?.waybill_id ||
          rData.courier_waybill_id ||
          rData.waybill_id ||
          '';
      } catch (e2) {
        // diamkan; waybill memang belum tersedia
      }
    }

    const updatePayload = {
      biteshipOrderId: data.id,
      biteshipStatus: data.status || data.courier?.status || 'created',
      waybillId: waybillId,
      courierCompany: data.courier_company || data.courier?.company || courier,
      courierType: data.courier_type || shipmentData.courier_type,
      trackingId: data.courier?.tracking_id || data.tracking_id || undefined,
      trackingUpdatedAt: new Date(),
      updatedAt: new Date()
    };
    await docRef.set(updatePayload,{merge:true});

    return res.status(200).json({
      success:true,
      shipment:data,
      ...updatePayload,
      note: waybillId ? undefined : 'Waybill belum tersedia, akan terisi setelah label dibuat / retrieve berikutnya.'
    });

  }catch(e){
    // IMPROVE: propagasikan error Biteship (khusus jam operasional instant) agar FE bisa tampilkan notifikasi tepat
    const respData = e.response?.data;
    const biteshipMsg = respData?.error || respData?.message || e.message;
    const biteshipCode = respData?.code || respData?.error_code;
    const isInstantWindowError =
      /service time must between/i.test(biteshipMsg || '') ||
      biteshipCode === 40002037;

    console.error('create-shipment error', respData || e.message);

    // Jika error jam operasional instant => kirim status 400 agar FE bisa bedakan
    if (isInstantWindowError) {
      return res.status(400).json({
        success:false,
        code: biteshipCode || 40002037,
        error: biteshipMsg
      });
    }

    return res.status(e.response?.status || 500).json({
      success:false,
      error:'Failed to create shipment',
      detail: respData || e.message
    });
  }
}
