import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Cloudinary env not configured' });
    }

    const { public_id } = req.body || {};
    if (!public_id || typeof public_id !== 'string') {
      return res.status(400).json({ error: 'public_id required' });
    }

    const resp = await cloudinary.uploader.destroy(public_id, { resource_type: 'image', invalidate: true });
    return res.status(200).json({ ok: true, result: resp?.result || 'ok' });
  } catch (e) {
    console.error('cloudinary destroy error', e);
    return res.status(500).json({ error: 'Delete failed', detail: String(e?.message || e) });
  }
}
