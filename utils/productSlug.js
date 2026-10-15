/**
 * Slug helpers shared between ProductCard links and product page SSG.
 * Must stay in sync so /product/[slug] resolves the same URL the UI generates.
 */
export function buildProductSlug(raw) {
  return (raw || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/(\d)\.(\d)/g, '$1-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getEffectiveProductSlug(product, docId) {
  const p = product || {};
  return (
    p.productSlug ||
    p.product_slug ||
    p.slug ||
    p.permalink ||
    docId ||
    (p.name ? buildProductSlug(p.name) : null) ||
    null
  );
}

export function getProductRouteSlug(product, docId) {
  const p = product || {};
  const id = docId ?? p.id;
  const baseSlug = buildProductSlug(p.name) || getEffectiveProductSlug(p, id);
  if (!baseSlug) return null;
  return id == null ? baseSlug : `${baseSlug}--id-${encodeURIComponent(String(id))}`;
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function serializeProductDoc(docSnap) {
  if (!docSnap) return null;
  if (docSnap && !docSnap.data) {
    return {
      ...docSnap,
      sku: docSnap.sku || docSnap.metadata?.sku || null,
      createdAt: toIsoDate(docSnap.createdAt || docSnap.created_at),
      updatedAt: toIsoDate(docSnap.updatedAt || docSnap.updated_at),
    };
  }
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    sku: data.sku || data.metadata?.sku || null,
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

/**
 * Resolve a product from the URL slug on server side.
 */
export async function findProductBySlug(adminDbOrNull, slug) {
  const normalized = decodeURIComponent(String(slug || '')).trim();
  if (!normalized) return null;
  const idMarker = '--id-';
  const idMarkerIndex = normalized.lastIndexOf(idMarker);
  const routeProductId = idMarkerIndex >= 0
    ? normalized.slice(idMarkerIndex + idMarker.length)
    : null;

  if (typeof window === 'undefined') {
    // 1. Try Drizzle
    try {
      const { db } = await import('@/db');
      const { products } = await import('@/db/schema');
      const { eq, or } = await import('drizzle-orm');

      if (db) {
        if (routeProductId) {
          const results = await db
            .select()
            .from(products)
            .where(eq(products.id, routeProductId))
            .limit(1);
          if (results.length > 0) return results[0];
        }

        const results = await db
          .select()
          .from(products)
          .where(
            or(
              eq(products.productSlug, normalized),
              eq(products.slug, normalized),
              eq(products.permalink, normalized),
              eq(products.id, normalized)
            )
          )
          .limit(1);

        if (results.length > 0) return results[0];
      }
    } catch (e) {
      // ignore
    }

    // 2. Try Supabase
    try {
      const { supabaseAdmin } = await import('@/utils/supabaseAdmin');
      if (routeProductId) {
        const { data: productById } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('id', routeProductId)
          .maybeSingle();
        if (productById) return productById;
      }

      const { data } = await supabaseAdmin
        .from('products')
        .select('*')
        .or(`product_slug.eq.${normalized},slug.eq.${normalized},permalink.eq.${normalized},id.eq.${normalized}`)
        .limit(1)
        .maybeSingle();

      if (data) return data;
    } catch (e) {
      // ignore
    }
  }

  // 3. Fallback to Firebase adminDb if passed
  if (adminDbOrNull) {
    const col = adminDbOrNull.collection('products');
    if (routeProductId) {
      const productById = await col.doc(routeProductId).get();
      if (productById.exists) return productById;
    }

    for (const field of ['productSlug', 'slug', 'permalink']) {
      const snap = await col.where(field, '==', normalized).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }
    const byId = await col.doc(normalized).get();
    if (byId.exists) return byId;
  }

  return null;
}
