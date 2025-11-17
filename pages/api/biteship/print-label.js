import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import stream from 'stream';
import fetch from 'node-fetch';
import { adminDb } from '@/utils/firebaseAdmin';
import { getStorage } from 'firebase-admin/storage';

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(number || 0);
}

const db = adminDb;
const storageBucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
const bucket = storageBucketName ? getStorage().bucket(storageBucketName) : getStorage().bucket();

export default async function handler(req, res) {
  try {
    const { deliveryId, invoiceId } = req.query;
    if (!deliveryId && !invoiceId) {
      return res.status(400).json({ error: 'deliveryId atau invoiceId diperlukan' });
    }

    // Ambil dokumen order/invoice
    let docSnap;
    let docData;
    let collectionName;
    if (deliveryId) {
      collectionName = 'orders';
      docSnap = await db.collection('orders').doc(deliveryId).get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Order tidak ditemukan' });
      docData = docSnap.data();
    } else {
      collectionName = 'invoices';
      docSnap = await db.collection('invoices').doc(invoiceId).get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
      docData = docSnap.data();
    }

    // Tentukan biteship order id field sesuai data
    const biteshipOrderId = docData.delivery_id || docData.biteshipOrderId || docData.codOrderId || docData.deliveryId;
    if (!biteshipOrderId) {
      return res.status(422).json({ error: 'Biteship order id (delivery_id / biteshipOrderId / codOrderId) tidak ditemukan' });
    }

    // Cek file di storage
    const file = bucket.file(`labels/label-${biteshipOrderId}.pdf`);
    try {
      const [exists] = await file.exists();
      if (exists) {
        const [url] = await file.getSignedUrl({
          action: 'read',
          // Perpanjang masa berlaku signed URL menjadi 24 jam
          expires: Date.now() + 24 * 60 * 60 * 1000
        });
        // Update dokumen agar labelGeneratedAt diperbarui setiap refresh URL
        try {
          await db.collection(collectionName).doc(deliveryId || invoiceId).update({
            labelUrl: url,
            labelGeneratedAt: new Date(),
            updatedAt: new Date()
          });
        } catch (e) {
          console.warn('Tidak bisa update doc saat refresh label URL:', e.message);
        }
        return res.status(200).json({ label_url: url });
      }
    } catch (e) {
      console.warn('Cek file di storage gagal, lanjut generate:', e.message);
    }

    // Ambil data Biteship
    let biteshipOrder;
    try {
      const r = await fetch(`https://api.biteship.com/v1/orders/${biteshipOrderId}`, {
        headers: {
          Authorization: `Bearer ${process.env.BITESHIP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        return res.status(r.status || 500).json({ error: data.message || 'Gagal ambil data Biteship' });
      }
      biteshipOrder = data;
    } catch (err) {
      console.error('Fetch Biteship error', err);
      return res.status(500).json({ error: 'Gagal ambil data Biteship' });
    }

    // Paths logo + watermark (jika ada)
    const courier = (biteshipOrder.courier?.company || '').toLowerCase();
    const logoMap = {
      tiki: path.resolve('./public/logos/tiki.png'),
      jne: path.resolve('./public/logos/jne.png'),
      jnt: path.resolve('./public/logos/jnt.png'),
      sicepat: path.resolve('./public/logos/sicepat.png'),
      grab: path.resolve('./public/logos/grab.png'),
      gojek: path.resolve('./public/logos/gojek.png'),
      anteraja: path.resolve('./public/logos/anteraja.png'),
      lalamove: path.resolve('./public/logos/lalamove.png'),
    };
    const preferredLogoPath = logoMap[courier];
    const logoPath = preferredLogoPath && fs.existsSync(preferredLogoPath)
      ? preferredLogoPath
      : (fs.existsSync(logoMap['tiki']) ? logoMap['tiki'] : null);
    const watermarkPath = path.resolve('./public/logos/watermark.png');

    const waybill = biteshipOrder.courier?.waybill_id || '-';
    const refNumber = biteshipOrder.id || biteshipOrderId;

    // Generate barcode buffers
    const [waybillBarcode, refBarcode] = await Promise.all([
      bwipjs.toBuffer({ bcid: 'code128', text: waybill, scale: 2, height: 25, includetext: false }),
      bwipjs.toBuffer({ bcid: 'code128', text: refNumber, scale: 1.2, height: 18, includetext: false })
    ]);

    // Generate PDF
    const doc = new PDFDocument({ size: [288, 432], margin: 8 });
    const passthroughStream = new stream.PassThrough();
    const uploadStream = file.createWriteStream({ metadata: { contentType: 'application/pdf' } });

    doc.pipe(passthroughStream);
    passthroughStream.pipe(uploadStream);

    // Watermark
    if (fs.existsSync(watermarkPath)) {
      doc.image(watermarkPath, 44, 120, { width: 200, opacity: 0.07 });
    }

    // Logo kurir
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, 8, 10, { width: 272, height: 38 });
    }

    let y = 54;
    doc.moveTo(8, y).lineTo(280, y).strokeColor('#000').lineWidth(1).stroke();

    // Waybill barcode + info
    y += 8;
    doc.image(waybillBarcode, 28, y, { width: 232, height: 45 });
    y += 45;
    doc.fontSize(12).font('Helvetica-Bold').text(`Nomor Resi: ${waybill}`, 8, y + 2, { align: 'center', width: 272 });
    y += 24;

    const ongkir = biteshipOrder.courier?.shipment_fee || docData.shippingCost || 0;
    doc.fontSize(11).font('Helvetica').text(`Ongkos Kirim: ${formatRupiah(ongkir)}`, 8, y, { width: 272, align: 'center' });
    y += 22;

  const courierBrand = (biteshipOrder.courier?.company || '').toUpperCase();
  const serviceType = (biteshipOrder.courier?.type || '').toUpperCase();
  doc.fontSize(11).font('Helvetica-Bold').text(`Jenis Layanan - ${courierBrand} ${serviceType}`.trim(), 8, y, { align: 'center', width: 272 });
    y += 25;

    doc.moveTo(8, y).lineTo(280, y).stroke();
    y += 18;

    // Reference & detail box
    doc.rect(8, y, 140, 58).stroke();
    doc.fontSize(8).font('Helvetica').text('Reference Number', 12, y + 4);
    doc.image(refBarcode, 18, y + 15, { width: 120, height: 20 });
    doc.fontSize(8).font('Helvetica').text(refNumber, 18, y + 37, { width: 120, align: 'center' });

    doc.rect(148, y, 132, 58).stroke();
    const qty = biteshipOrder.items?.reduce((a, b) => a + (b.quantity || 0), 0) || 0;
    const weight = (biteshipOrder.items?.reduce((a, b) => a + ((b.weight || 0) * (b.quantity || 1)), 0) || 0) / 1000;
    const insurance = biteshipOrder.courier?.insurance?.fee || 0;

    doc.fontSize(10).font('Helvetica').text(`Quantity : ${qty} Pcs`, 152, y + 8);
    doc.text(`Weight   : ${weight} Kg`, 152, y + 24);
    doc.text(`Asuransi : ${formatRupiah(insurance)}`, 152, y + 40);

    y += 60;
    doc.moveTo(8, y).lineTo(280, y).stroke();
    y += 8;

    doc.rect(8, y, 136, 60).stroke();
    doc.rect(144, y, 136, 60).stroke();

  const buyer = biteshipOrder.destination || {};
  const invoiceDestAddress = (docData && docData.destination && docData.destination.address) || docData?.destination_address || null;
    doc.fontSize(9).font('Helvetica-Bold').text('Alamat Penerima:', 12, y + 5);
    doc.font('Helvetica').fontSize(9).text(buyer.contact_name || '-', 12, y + 20);
    doc.text(buyer.contact_phone || '-', 12, y + 32);
    const buyerAddressFull = (
      invoiceDestAddress ||
      buyer.address ||
      [
        buyer.administrative_division_level_3_name,
        buyer.administrative_division_level_2_name,
        buyer.administrative_division_level_1_name,
        buyer.postal_code,
      ].filter(Boolean).join(', ')
    );
    doc.text(buyerAddressFull, 12, y + 44, { width: 128 });

    const seller = biteshipOrder.origin || biteshipOrder.shipper || {};
    doc.font('Helvetica-Bold').fontSize(9).text('Alamat Pengirim:', 148, y + 5);
    doc.font('Helvetica').fontSize(9).text(seller.contact_name || '-', 148, y + 20);
    doc.text(seller.contact_phone || '-', 148, y + 32);
    doc.text(
      [seller.address, seller.administrative_division_level_3_name, seller.administrative_division_level_2_name, seller.administrative_division_level_1_name, seller.postal_code]
        .filter(Boolean)
        .join(', '),
      148,
      y + 44,
      { width: 128 }
    );

    y += 60;
    doc.moveTo(8, y).lineTo(350, y).stroke();
    y += 18;

    doc.font('Helvetica').fontSize(9).text('Catatan :', 12, y);
    doc.text(biteshipOrder.note || '-', 82, y, { width: 196 });
    y += 18;

    doc.moveTo(8, y).lineTo(280, y).stroke();
    doc.end();

    // Tunggu upload selesai
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });

    // Signed URL
    let url;
    try {
      [url] = await file.getSignedUrl({
        action: 'read',
        // 24 jam masa berlaku
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });
    } catch (signedUrlErr) {
      console.error('Error mendapatkan signed URL:', signedUrlErr);
      return res.status(500).json({ error: 'Gagal generate URL label' });
    }

    // Optional: simpan labelUrl ke dokumen
    try {
      await db.collection(collectionName).doc(deliveryId || invoiceId).update({
        labelUrl: url,
        labelGeneratedAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (e) {
      console.warn('Tidak dapat update doc dengan labelUrl:', e.message);
    }

    return res.status(200).json({ label_url: url });
  } catch (err) {
    console.error('Unexpected Error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
}
