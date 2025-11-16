import axios from 'axios';

// Daftar kategori yang (umumnya) diterima Biteship (sesuaikan bila Anda punya daftar resmi)
const ALLOWED_CATEGORIES = [
  'fashion','accessories','electronics','gadget','beauty','health','food',
  'groceries','toys','books','office','sport','muslim','mom_baby','pets',
  'automotive','household','documents','others','other'
];

function pickCategory(rawName='', rawCat='') {
  // Prioritas kategori asli bila valid
  if (rawCat && ALLOWED_CATEGORIES.includes(rawCat.toLowerCase())) {
    return rawCat.toLowerCase();
  }
  const name = (rawName || '').toLowerCase();
  // Heuristik sederhana
  if (/baju|kaos|celana|hoodie|dress|kemeja|fashion|pakaian/.test(name)) return 'fashion';
  if (/sepatu|sandal|shoes/.test(name)) return 'fashion';
  if (/hp|phone|gadget|laptop|elektronik|earbud|headset|charger|usb|kamera|camera/.test(name)) return 'electronics';
  if (/mainan|toy|lego|figure/.test(name)) return 'toys';
  if (/buku|book|novel/.test(name)) return 'books';
  if (/obat|vitamin|supplement|kesehatan|health/.test(name)) return 'health';
  if (/kecantikan|skincare|lipstik|kosmetik|beauty/.test(name)) return 'beauty';
  if (/makanan|food|snack|minuman|drink|beverage/.test(name)) return 'food';
  if (/bayi|baby|diaper|stroller/.test(name)) return 'mom_baby';
  if (/motor|mobil|sparepart|otomotif|automotive/.test(name)) return 'automotive';
  return 'others';
}

function normalizeCourierType(serviceCode='') {
  if (!serviceCode) return 'reg';
  return String(serviceCode).toLowerCase(); // Biteship contoh "reg"
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Permanently disable COD endpoint
  return res.status(410).json({
    error: 'COD telah dinonaktifkan',
    message: 'Metode Cash on Delivery (COD) tidak lagi tersedia. Silakan gunakan pembayaran Xendit (Transfer/VA/QRIS/e-Wallet).'
  });
  try {
    const {
      invoiceId,
      courier_code,
      courier_service_code,
      buyer,
      destination_address,
      destination_postal_code,
      items = [],
      cod_amount,
      cod_type = '7_days',
      order_note = '',
    } = req.body;

    if (!['jne','tiki','jnt','sicepat','anteraja'].includes(courier_code)) {
      return res.status(400).json({ message: 'Kurir tidak mendukung COD.' });
    }

    if (!cod_amount || Number(cod_amount) <= 0) {
      return res.status(400).json({ message: 'cod_amount tidak valid.' });
    }

    const sanitizedItems = items.map((it, idx) => {
      const cat = pickCategory(it.name, it.category);
      return {
        name: it.name || `Item ${idx+1}`,
        description: it.description || it.variant || '',
        category: cat,
        value: Number(it.price || it.value || 0),
        quantity: Number(it.quantity) || 1,
        height: it.height || 1,
        length: it.length || 1,
        weight: it.weight
          ? Number(it.weight)
          : (it.normalizedWeight ? Number(it.normalizedWeight) : 200),
        width: it.width || 1
      };
    });

    const payload = {
      shipper_contact_name: process.env.BITESHIP_SHIPPER_NAME || process.env.NEXT_PUBLIC_STORE_NAME || 'Store',
      shipper_contact_phone: process.env.BITESHIP_SHIPPER_PHONE || '0000000000',
      shipper_contact_email: process.env.BITESHIP_SHIPPER_EMAIL || 'store@example.com',
      shipper_organization: process.env.BITESHIP_SHIPPER_ORG || 'Store Org',
      origin_contact_name: process.env.BITESHIP_SHIPPER_NAME || 'Store',
      origin_contact_phone: process.env.BITESHIP_SHIPPER_PHONE || '0000000000',
      origin_address: process.env.BITESHIP_ORIGIN_ADDRESS || 'Alamat Origin',
      origin_note: '',
      origin_postal_code: Number(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_AREA_ID) || 16516,

      destination_contact_name: buyer?.name || '',
      destination_contact_phone: buyer?.phone || '',
      destination_contact_email: buyer?.email || '',
      destination_address,
      destination_note: '',
      destination_postal_code: destination_postal_code ? Number(destination_postal_code) : undefined,

      destination_cash_on_delivery: Math.round(Number(cod_amount) || 0),
      destination_cash_on_delivery_type: cod_type,

      courier_company: courier_code,
      courier_type: normalizeCourierType(courier_service_code),
      courier_insurance: 0,
      delivery_type: 'now',
      order_note,
      metadata: { invoiceId },
      items: sanitizedItems
    };

    const resp = await axios.post('https://api.biteship.com/v1/orders', payload, {
      headers: {
        Authorization: `Bearer ${process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return res.status(200).json({ success: true, order: resp.data });
  } catch (e) {
    console.error('Create COD order error:', e.response?.data || e.message);
    return res.status(500).json({
      message: 'Gagal membuat order COD',
      detail: e.response?.data || { error: e.message }
    });
  }
}