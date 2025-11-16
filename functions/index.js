// ...existing code...
/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// dotenv not required in Cloud Functions runtime; environment variables / secrets handled by Firebase.

const {setGlobalOptions} = require("firebase-functions");
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { PassThrough } = require('stream');

// --- INIT ADMIN ---
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

// --- HELPERS ---
function formatIDR(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
}

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Secret: Telegram Bot Token (must be set via `firebase functions:secrets:set TELEGRAM_BOT_TOKEN`)
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

// ========== 1. Kirim Pengingat Pembayaran ==========
exports.sendPaymentReminder = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { invoiceId, email, name, total } = req.body || {};
    if (!invoiceId || !email) return res.status(400).json({ error: 'invoiceId & email required' });

    // Cek invoice valid & status
    const snap = await db.collection('invoices').doc(invoiceId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Invoice not found' });
    const inv = snap.data();
    if (!['awaiting_payment', 'waiting'].includes(inv.status)) {
      return res.status(422).json({ error: 'Status tidak boleh dikirim pengingat' });
    }

    // TODO: Integrasi email provider (SendGrid/Resend/SMTP)
    console.log('Send reminder =>', email, invoiceId, total);

    // Simpan log sederhana
    await db.collection('webhooks_logs').add({
      type: 'payment_reminder',
      invoiceId,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ========== 2. Print Label (Biteship) ==========
exports.printLabel = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only ?invoiceId=' });
  const { invoiceId } = req.query;
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });

  try {
    const docRef = db.collection('invoices').doc(invoiceId);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = snap.data();

    const biteshipOrderId = invoice.biteshipOrderId || invoice.codOrderId || invoice.delivery_id;
    if (!biteshipOrderId) {
      return res.status(422).json({ error: 'Belum ada Biteship Order ID' });
    }

    // Cek label cached
    const file = bucket.file(`labels/label-${biteshipOrderId}.pdf`);
    const [exists] = await file.exists();
    if (exists) {
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
      return res.json({ label_url: url });
    }

    // Ambil order detail Biteship
    const resp = await fetch(`https://api.biteship.com/v1/orders/${biteshipOrderId}`, {
      headers: {
        Authorization: `Bearer ${BITESHIP_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      return res.status(resp.status).json({ error: data.message || 'Gagal ambil order Biteship' });
    }

    const waybill = data.courier?.waybill_id || 'WAYBILL';
    const ref = data.id;
    const ongkir = data.courier?.shipment_fee || invoice.shippingCost || 0;

    // Barcode buffers
    const [waybillBarcode, refBarcode] = await Promise.all([
      bwipjs.toBuffer({ bcid: 'code128', text: waybill, scale: 2, height: 38, includetext: false }),
      bwipjs.toBuffer({ bcid: 'code128', text: ref, scale: 1.4, height: 22, includetext: false })
    ]);

    // Generate PDF
    const doc = new PDFDocument({ size: [288, 432], margin: 8 });
    const pass = new PassThrough();
    const writeStream = file.createWriteStream({ metadata: { contentType: 'application/pdf' } });
    doc.pipe(pass).pipe(writeStream);

    doc.fontSize(12).text('Shipping Label', { align: 'center' });
    doc.moveDown(0.5);
    doc.image(waybillBarcode, { width: 260, align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).text(`Waybill: ${waybill}`, { align: 'center' });
    doc.moveDown(0.4);
    doc.image(refBarcode, { width: 180, align: 'center' });
    doc.fontSize(8).text(ref, { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(9).text(`Ongkir: ${formatIDR(ongkir)}`, { align: 'center' });
    doc.moveDown(0.4);

    const dest = data.destination || {};
    const orig = data.origin || {};
    doc.fontSize(8).text('PENGIRIM:', { underline: true });
    doc.text(`${orig.contact_name || '-'} / ${orig.contact_phone || '-'}`);
    doc.text(orig.address || '-');
    doc.moveDown(0.3);
    doc.fontSize(8).text('PENERIMA:', { underline: true });
    doc.text(`${dest.contact_name || '-'} / ${dest.contact_phone || '-'}`);
    doc.text(dest.address || '-');
    doc.moveDown(0.5);
    doc.fontSize(8).text('ITEMS:', { underline: true });
    (data.items || []).slice(0, 5).forEach(it => {
      doc.text(`- ${it.name} x${it.quantity}`);
    });
    if ((data.items || []).length > 5) {
      doc.text(`+ ${(data.items.length - 5)} lainnya...`);
    }

    doc.end();
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });

    await docRef.update({
      labelUrl: signedUrl,
      labelGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ label_url: signedUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// ========== 3. Scheduled cleanup: delete old label PDFs in Storage ==========
// Runs daily and removes files under labels/ (or label/) older than 3 days
exports.cleanupOldLabels = onSchedule({ schedule: 'every 24 hours', timeZone: 'Asia/Jakarta' }, async (event) => {
    const prefixes = ['labels/', 'label/'];
    const now = Date.now();
    const ageMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    const deleted = [];
    const errors = [];

    try {
      for (const prefix of prefixes) {
        const [files] = await bucket.getFiles({ prefix });
        for (const file of files) {
          try {
            // Skip folders/placeholders
            const name = file.name || '';
            if (!name || name.endsWith('/')) continue;
            // Only target PDFs (safety), but allow other ext if needed
            const isPdf = name.toLowerCase().endsWith('.pdf');
            if (!isPdf) continue;

            // Ensure metadata is loaded
            const [metadata] = file.metadata ? [file.metadata] : await file.getMetadata();
            const createdStr = metadata.timeCreated || metadata.updated || null;
            if (!createdStr) continue;
            const createdAt = new Date(createdStr).getTime();
            if (!Number.isFinite(createdAt)) continue;

            if (now - createdAt >= ageMs) {
              await file.delete();
              deleted.push(name);
            }
          } catch (e) {
            errors.push({ file: file.name, error: String(e && e.message || e) });
          }
        }
      }
    } catch (e) {
      console.error('cleanupOldLabels fatal:', e);
      throw e;
    }

    console.log(`cleanupOldLabels done. deleted=${deleted.length}`, deleted.slice(0, 20));
    if (errors.length) console.warn('cleanupOldLabels errors:', errors.slice(0, 10));
    return null;
  });

// ========== 4. Telegram Bot Notification ========== 
// Helper: send Telegram message to all chatIds (from Firestore settings/telegram.chatIds)
async function sendTelegramToAdmins(text) {
  const doc = await admin.firestore().collection('settings').doc('telegram').get();
  const chatIds = Array.isArray(doc.data()?.chatIds) ? doc.data().chatIds : [];
  // Prefer secret at runtime; fallback to env for local dev
  const token = (typeof TELEGRAM_BOT_TOKEN.value === 'function' ? TELEGRAM_BOT_TOKEN.value() : '') || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token || chatIds.length === 0) {
    console.warn('Telegram broadcast skipped. token?', !!token, 'chatIdsCount', chatIds.length);
    return;
  }
  console.log('Telegram broadcast -> chatIdsCount', chatIds.length);
  const urlBase = `https://api.telegram.org/bot${token}/sendMessage`;
  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(urlBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text })
        });
        if (!res.ok) {
          const t = await res.text();
          console.error('Telegram send failed', chatId, res.status, t);
        }
      } catch (e) {
        console.error('Telegram send error', chatId, e?.message || e);
      }
    })
  );
}

// Trigger: chat baru (v2)
exports.notifyNewChat = onDocumentCreated({ document: 'chats/{chatId}/messages/{msgId}', region: 'asia-southeast1', secrets: [TELEGRAM_BOT_TOKEN] }, async (event) => {
  const snap = event.data; // QueryDocumentSnapshot
  if (!snap) return;
  const data = snap.data() || {};
  const chatId = event.params?.chatId;

  // Try resolve buyer/user display name from message payload first
  let displayName = data.buyerName || data.userName || data.senderName || data.name || data.user?.name || '';

  // If not present, look up chat meta document for buyer/customer name
  if (!displayName && chatId) {
    try {
      const chatSnap = await db.collection('chats').doc(chatId).get();
      if (chatSnap.exists) {
        const meta = chatSnap.data() || {};
        displayName = meta.buyerName || meta?.buyer?.name || meta.customerName || meta?.customer?.name || meta.userName || meta.name || '';
      }
    } catch (e) {
      console.warn('notifyNewChat: failed to fetch chat meta', chatId, e?.message || e);
    }
  }

  if (!displayName) displayName = '-';

  const msg = data.text || data.message || data.content || JSON.stringify(data);
  const time = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const text = `💬 Chat baru dari ${displayName}\n${msg}\n${time.toLocaleString('id-ID')}`;
  await sendTelegramToAdmins(text);
});

// Trigger: invoice status changed to PAID/COD
exports.notifyInvoicePaid = onDocumentUpdated({ document: 'invoices/{invoiceId}', region: 'asia-southeast1', secrets: [TELEGRAM_BOT_TOKEN] }, async (event) => {
  const before = event.data?.before?.data?.() || {};
  const after = event.data?.after?.data?.() || {};
  if (!after || Object.keys(after).length === 0) return;

  const prevStatus = String(before.status || '').toLowerCase();
  const currStatus = String(after.status || '').toLowerCase();
  const prevPM = String(before.paymentMethod || before.payment_method || '').toLowerCase();
  const currPM = String(after.paymentMethod || after.payment_method || '').toLowerCase();

  const paidSet = new Set(['paid', 'success', 'cod', 'cod_confirmed']);
  const isPaidTransition = prevStatus !== currStatus && paidSet.has(currStatus);
  const becameCod = currPM === 'cod' && prevPM !== 'cod';

  // For COD, also notify when paymentMethod changes to 'cod', even if status doesn't change to a paid-like state
  if (!isPaidTransition && !becameCod) return;

  const invoiceId = event.params.invoiceId;
  const buyer = after.buyerName || after?.buyer?.name || after.customerName || after?.customer?.name || after.name || '-';

  // Prefer grandTotal; fallback to other known fields
  const pickTotal = (inv) => {
    const candidates = [
      'grandTotal', 'grand_total', 'grandtotal', 'grand', 'grandAmount', 'grand_amount',
      'totalPayment', 'total_payment', 'total', 'amount', 'finalAmount', 'final_amount'
    ];
    for (const k of candidates) {
      if (inv && inv[k] != null) {
        const n = Number(inv[k]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 0;
  };
  const total = pickTotal(after);

  const method = currPM === 'cod' ? 'COD' : (after.paymentMethod || after.payment_method || 'Transfer');
  const header = currPM === 'cod' && becameCod && !isPaidTransition ? '🧾 Order COD baru' : '✅ Pembayaran diterima';

  const msg = [
    header,
    `Invoice: ${invoiceId}`,
    `Pembeli: ${buyer}`,
    `Metode: ${method}`,
    `Total: ${formatIDR(total)}`
  ].join('\n');
  await sendTelegramToAdmins(msg);
});

// ========== 5. Generate Daily Layout Summary (favorites, recommendations, ads) ==========
exports.generateDailyLayout = onSchedule({ schedule: 'every day 00:05', timeZone: 'Asia/Jakarta' }, async () => {
  try {
    const payload = await buildDailyLayoutSummary();
    await db.collection('layout_summaries').doc(payload.date).set(payload, { merge: true });
    await db.collection('layout_summaries').doc('latest').set(payload, { merge: true });
    console.log('generateDailyLayout success', payload.date, { favorites: payload.favorites.length });
  } catch (e) {
    console.error('generateDailyLayout failed', e);
    throw e;
  }
});

// Manual on-demand regeneration (secured by optional simple token query param)
exports.regenerateDailyLayout = functions.https.onRequest(async (req, res) => {
  try {
    const token = process.env.REGENERATE_TOKEN || null;
    if (token && req.query.token !== token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = await buildDailyLayoutSummary();
    await db.collection('layout_summaries').doc(payload.date).set(payload, { merge: true });
    await db.collection('layout_summaries').doc('latest').set(payload, { merge: true });
    res.json({ ok: true, date: payload.date, favorites: payload.favorites.length, recommendations: payload.recommendations.length, ads: payload.ads.length });
  } catch (e) {
    console.error('regenerateDailyLayout error', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Optional: simple test endpoint to verify Telegram delivery and chatIds
exports.testTelegram = functions.https.onRequest(async (req, res) => {
  try {
    const text = req.query.text || 'Test Telegram from Functions';
    await sendTelegramToAdmins(String(text));
    res.json({ ok: true });
  } catch (e) {
    console.error('testTelegram error', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ========== DAILY LAYOUT SUMMARY BUILDER ==========
// Tambahkan di atas exports.generateDailyLayout
async function buildDailyLayoutSummary() {
  const today = new Date().toISOString().slice(0,10);
  const prodSnap = await db.collection('products').get();
  const all = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Helper: slugify
  const slugify = (s) => (s||'').toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  // Lean product transformer (lengkap untuk PopupCart)
  const leanProduct = (p) => {
    const firstImg = Array.isArray(p.images) ? p.images.find(i => typeof i === 'string' && i.trim()) : (p.image || null);
    let sizeVariants = [];
    if (Array.isArray(p.sizeVariants) && p.sizeVariants.length) {
      sizeVariants = p.sizeVariants.map(v => ({
        size: v.size ?? null,
        priceRetail: v.priceRetail ?? v.price_retail ?? null,
        priceWholesale: v.priceWholesale ?? v.price_wholesale ?? null,
        weight: v.weight != null ? Number(v.weight) : null,
        minWholesale: v.minWholesale ?? v.min_wholesale ?? v.min_wholesale_qty ?? p.minWholesale ?? p.min_wholesale ?? p.min_wholesale_qty ?? null
      })).filter(v => v.priceRetail != null || v.priceWholesale != null);
    } else {
      const retail = p.priceRetail ?? p.price_retail ?? null;
      const wholesale = p.priceWholesale ?? p.price_wholesale ?? null;
      if (retail != null || wholesale != null) {
        sizeVariants = [{
          size: null,
          priceRetail: retail ?? null,
          priceWholesale: wholesale ?? null,
          weight: p.weight != null ? Number(p.weight) : null,
          minWholesale: p.minWholesale ?? p.min_wholesale ?? p.min_wholesale_qty ?? null
        }];
      }
    }
    return {
      id: p.id,
      name: p.name || '',
      productSlug: p.productSlug || p.slug || (p.name ? slugify(p.name) : p.id),
      slug: p.slug || p.productSlug || null,
      image: firstImg || null,
      images: Array.isArray(p.images) ? p.images.filter(i => typeof i === 'string' && i.trim()) : (firstImg ? [firstImg] : []),
      sizeVariants,
      discount: p.discount || 0,
      rating: p.rating || null,
      sold: p.sold || p.salesCount || 0,
      minWholesale: p.minWholesale ?? p.min_wholesale ?? p.min_wholesale_qty ?? null,
      weight: p.weight != null ? Number(p.weight) : null,
      description: p.description || '',
      video: p.video || null,
      category: p.category || '',
      stock: p.stock ?? p.inStock ?? null
    };
  };

  // Exclude aquarium/fish categories and keywords
  const excludeKeywords = [
    'akuarium','aquarium','aquascape','ikan','fish','koi','guppy','cupang','manfish','cichlid','platy','udang','shrimp','pakan','tank','substrat','aerator','filter kolam','heater aquarium','filter aquarium','pompa udara','hias air'
  ];
  const isExcluded = (p) => {
    const blob = [p?.category, p?.categorySlug, p?.name, p?.productSlug]
      .filter(Boolean)
      .join(' ')?.toLowerCase() || '';
    return excludeKeywords.some(k => blob.includes(k));
  };

  // Pool besar untuk shuffle (bukan hanya rating tinggi)
  const poolSize = 100;
  const favoritesPool = all
    .filter(p => !isExcluded(p))
    .filter(p => (p.rating || 0) >= 4.0 && (p.sold || 0) > 0)
    .sort((a,b) => (b.rating - a.rating) || (b.sold - a.sold))
    .slice(0, poolSize);

  // Pool rekomendasi: produk random dari semua yang aktif
  const recPool = all.filter(p => (p.sold || 0) >= 0).filter(p => !isExcluded(p));

  // Seeded shuffle (berubah setiap hari)
  const seedString = today;
  let seed = 0; for (const ch of seedString) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=(t^t>>>7);t=Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296}}
  const rng = mulberry32(seed);
  function shuffleDet(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  const favorites = shuffleDet(favoritesPool).slice(0,8).map(leanProduct);
  const recommendations = shuffleDet(recPool).slice(0,12).map(leanProduct);

  // Schema builder
  const BASE_URL = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com').replace(/\/$/, '');
  const productToSchema = (p) => {
    const variant = Array.isArray(p.sizeVariants) && p.sizeVariants.length ? p.sizeVariants[0] : null;
    const price = variant?.priceRetail ?? variant?.priceWholesale ?? null;
    if (!price) return null;
    return {
      '@type': 'Product',
      name: p.name,
      image: p.image || (Array.isArray(p.images) ? p.images[0] : null) || null,
      sku: p.id,
      url: `${BASE_URL}/product/${p.slug || p.productSlug || p.id}`,
      offers: {
        '@type': 'Offer',
        price: String(price),
        priceCurrency: 'IDR',
        availability: 'https://schema.org/InStock'
      }
    };
  };
  const favoritesSchema = favorites.map(productToSchema).filter(Boolean);
  const recommendationsSchema = recommendations.map(productToSchema).filter(Boolean);

  // Ads / banners
  const bannerSnap = await db.collection('banners').get();
  const banners = [];
  const nowMs = Date.now();
  bannerSnap.forEach(doc => {
    const data = doc.data() || {};
    const start = data.startDate ? Date.parse(data.startDate) : null;
    const end = data.endDate ? Date.parse(data.endDate) : null;
    const active = (!start || start <= nowMs) && (!end || end >= nowMs);
    if (!active) return;
    if (Array.isArray(data.images)) {
      data.images.forEach((u,idx)=>{
        if (typeof u === 'string' && u.trim()) {
          banners.push({ url: u.trim(), alt: (data.alts && data.alts[idx]) || 'Homepage Banner', width: data.width||1200, height: data.height||630 });
        }
      });
    }
  });
  // Limit banners to 4 unique
  const seen = new Set();
  const ads = [];
  for (const b of banners) { if (ads.length>=4) break; if (seen.has(b.url)) continue; seen.add(b.url); ads.push(b); }

  return {
    date: today,
    favorites,
    recommendations,
    ads,
    favoritesSchema,
    recommendationsSchema,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 2
  };
}
