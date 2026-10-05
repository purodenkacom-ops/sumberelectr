import { supabaseAdmin } from '@/utils/supabaseAdmin';

const LABEL_BUCKET = 'shipping-labels';
const LABEL_FOLDER = 'labels';
const LABEL_EXPIRY_DAYS = 30;

export default async function handler(req, res) {
  // Hanya bisa diakses via cron atau admin dengan secret key
  const cronSecret = req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET_KEY;
  
  if (expectedSecret && cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LABEL_EXPIRY_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[Cleanup Labels] Memulai cleanup label lebih dari ${LABEL_EXPIRY_DAYS} hari...`);
    console.log(`[Cleanup Labels] Cutoff date: ${cutoffISO}`);

    // 1. Ambil semua invoice yang punya label_url dan label_generated_at lebih dari 30 hari
    const { data: oldInvoices, error: queryError } = await supabaseAdmin
      .from('invoices')
      .select('id, label_url, label_generated_at')
      .not('label_url', 'is', null)
      .not('label_generated_at', 'is', null)
      .lt('label_generated_at', cutoffISO);

    if (queryError) throw queryError;

    console.log(`[Cleanup Labels] Ditemukan ${oldInvoices?.length || 0} invoice dengan label lama.`);

    if (!oldInvoices || oldInvoices.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada label yang perlu dihapus.',
        deleted: 0,
        errors: []
      });
    }

    const deletedFiles = [];
    const errors = [];
    const updatedInvoices = [];

    // 2. Hapus file dari Supabase Storage
    for (const invoice of oldInvoices) {
      try {
        // Extract filename dari URL
        const url = invoice.label_url;
        const fileNameMatch = url.match(/labels\/label-[^/]+\.pdf/);
        
        if (!fileNameMatch) {
          console.warn(`[Cleanup Labels] Tidak bisa extract filename dari URL: ${url}`);
          continue;
        }

        const filePath = fileNameMatch[0];
        
        // Hapus dari storage
        const { error: deleteError } = await supabaseAdmin.storage
          .from(LABEL_BUCKET)
          .remove([filePath]);

        if (deleteError) {
          console.error(`[Cleanup Labels] Gagal hapus ${filePath}:`, deleteError);
          errors.push({ file: filePath, error: deleteError.message });
          continue;
        }

        deletedFiles.push(filePath);
        updatedInvoices.push(invoice.id);
        console.log(`[Cleanup Labels] ✅ Dihapus: ${filePath}`);
      } catch (err) {
        console.error(`[Cleanup Labels] Error processing invoice ${invoice.id}:`, err);
        errors.push({ invoiceId: invoice.id, error: err.message });
      }
    }

    // 3. Update invoice: hapus label_url dan label_generated_at
    if (updatedInvoices.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('invoices')
        .update({
          label_url: null,
          label_generated_at: null,
          updated_at: new Date().toISOString()
        })
        .in('id', updatedInvoices);

      if (updateError) {
        console.error('[Cleanup Labels] Gagal update invoices:', updateError);
        errors.push({ type: 'batch_update', error: updateError.message });
      } else {
        console.log(`[Cleanup Labels] ✅ ${updatedInvoices.length} invoice diupdate.`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Cleanup selesai. ${deletedFiles.length} label dihapus, ${updatedInvoices.length} invoice diupdate.`,
      deleted: deletedFiles.length,
      deletedFiles,
      updatedInvoices: updatedInvoices.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('[Cleanup Labels] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}
