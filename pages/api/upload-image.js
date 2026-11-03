import { v2 as cloudinary } from 'cloudinary';
import formidable from 'formidable';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '12mb'
  }
};

async function requireAdmin(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  return !profileError && profile?.role === 'admin';
}

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
    if (!(await requireAdmin(req))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

    const requestedFolder = Array.isArray(parsed.fields.folder)
      ? parsed.fields.folder[0]
      : parsed.fields.folder;
    const allowedFolders = ['banners', 'categories/icons', 'categories/banners'];
    if (requestedFolder !== undefined && !allowedFolders.includes(requestedFolder)) {
      return res.status(400).json({ error: 'Invalid upload folder' });
    }

    const baseFolder = process.env.CLOUDINARY_FOLDER || 'sumber/products';
    const folder = requestedFolder ? `${baseFolder}/${requestedFolder}` : baseFolder;
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
