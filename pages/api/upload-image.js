import { v2 as cloudinary } from 'cloudinary';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '12mb'
  }
};

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

    const form = formidable({ multiples: false, maxFileSize: 12 * 1024 * 1024 });
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const file = parsed.files.file || parsed.files.image || parsed.files.photo;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
    }

    const filePath = Array.isArray(file) ? file[0].filepath : file.filepath || file.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid upload payload' });
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'sumber/products';
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
      overwrite: false,
      use_filename: true,
      unique_filename: true
    });

    return res.status(200).json({
      ok: true,
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format
    });
  } catch (e) {
    console.error('cloudinary upload error', e);
    return res.status(500).json({ error: 'Upload failed', detail: String(e?.message || e) });
  }
}
