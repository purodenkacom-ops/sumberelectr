/**
 * Slug helpers shared between ProductCard links and product page SSG.
 * Must stay in sync so /product/[slug] resolves the same URL the UI generates.
 */
export function buildProductSlug(raw) {
  return (raw || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getEffectiveProductSlug(product, docId) {
  const p = product || {};
  return (
    p.productSlug ||
    p.slug ||
    p.permalink ||
    (p.name ? buildProductSlug(p.name) : null) ||
    docId ||
    null
  );
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function serializeProductDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

/**
 * Resolve a product document from the URL slug (Admin SDK).
 */
export async function findProductBySlug(adminDb, slug) {
  const normalized = decodeURIComponent(String(slug || '')).trim();
  if (!normalized) return null;

  const col = adminDb.collection('products');

  for (const field of ['productSlug', 'slug', 'permalink']) {
    const snap = await col.where(field, '==', normalized).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  const byId = await col.doc(normalized).get();
  if (byId.exists) return byId;

  // Fallback: match canonical URL slug or legacy name-only slug (when productSlug has extra suffix)
  const allSnap = await col.get();
  for (const doc of allSnap.docs) {
    const data = doc.data();
    if (getEffectiveProductSlug(data, doc.id) === normalized) return doc;
    if (data.name && buildProductSlug(data.name) === normalized) return doc;
  }

  return null;
}
