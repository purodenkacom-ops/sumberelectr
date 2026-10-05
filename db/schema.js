import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Supabase auth UID or Firebase UID
  firebaseUid: varchar('firebase_uid', { length: 255 }),
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 50 }).default('buyer'),
  profile: jsonb('profile').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const categories = pgTable('categories', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  parentId: varchar('parent_id', { length: 255 }),
  banner: text('banner'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const products = pgTable('products', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }),
  productSlug: varchar('product_slug', { length: 255 }),
  permalink: varchar('permalink', { length: 255 }),
  categoryId: varchar('category_id', { length: 255 }),
  category: text('category'),
  categorySlug: varchar('category_slug', { length: 255 }),
  subCategory: text('sub_category'),
  subCategorySlug: varchar('sub_category_slug', { length: 255 }),
  description: text('description'),
  images: jsonb('images').default([]),
  image: text('image'),
  price: numeric('price', { precision: 12, scale: 2 }).default('0'),
  priceRetail: numeric('price_retail', { precision: 12, scale: 2 }).default('0'),
  priceWholesale: numeric('price_wholesale', { precision: 12, scale: 2 }).default('0'),
  minWholesale: integer('min_wholesale').default(1),
  discount: numeric('discount', { precision: 5, scale: 2 }).default('0'),
  weight: numeric('weight', { precision: 10, scale: 2 }).default('0'),
  stock: integer('stock').default(0),
  sold: integer('sold').default(0),
  salesCount: integer('sales_count').default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('0'),
  reviewCount: integer('review_count').default(0),
  sizeVariants: jsonb('size_variants').default([]),
  specifications: jsonb('specifications').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const carts = pgTable('carts', {
  id: varchar('id', { length: 255 }).primaryKey(), // Buyer UID or guest session
  items: jsonb('items').default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: varchar('id', { length: 255 }).primaryKey(), // invoiceId
  buyerId: varchar('buyer_id', { length: 255 }),
  buyerName: varchar('buyer_name', { length: 255 }),
  buyerEmail: varchar('buyer_email', { length: 255 }),
  buyerPhone: varchar('buyer_phone', { length: 50 }),
  guestUid: varchar('guest_uid', { length: 255 }),
  guestSessionId: varchar('guest_session_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('draft'),
  paymentMethod: varchar('payment_method', { length: 50 }),
  paymentGateway: varchar('payment_gateway', { length: 50 }),
  items: jsonb('items').default([]),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).default('0'),
  shippingCost: numeric('shipping_cost', { precision: 12, scale: 2 }).default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0'),
  grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).default('0'),
  shippingAddress: jsonb('shipping_address').default({}),
  shippingSelection: jsonb('shipping_selection').default({}),
  biteship: jsonb('biteship').default({}),
  midtrans: jsonb('midtrans').default({}),
  xendit: jsonb('xendit').default({}),
  voucherCode: varchar('voucher_code', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const orders = pgTable('orders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  invoiceId: varchar('invoice_id', { length: 255 }),
  buyerId: varchar('buyer_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'),
  data: jsonb('data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const reviews = pgTable('reviews', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull(),
  buyerId: varchar('buyer_id', { length: 255 }),
  userName: varchar('user_name', { length: 255 }),
  userImage: text('user_image'),
  rating: integer('rating').notNull().default(5),
  comment: text('comment'),
  images: jsonb('images').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const vouchers = pgTable('vouchers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  type: varchar('type', { length: 50 }).default('percentage'),
  value: numeric('value', { precision: 10, scale: 2 }).default('0'),
  maxDiscount: numeric('max_discount', { precision: 12, scale: 2 }).default('0'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  active: boolean('active').default(true),
  voucherKind: varchar('voucher_kind', { length: 50 }).default('general'),
  totalQty: integer('total_qty'),
  usedCount: integer('used_count').default(0),
  maxUses: integer('max_uses').default(1),
  allowedBuyerId: varchar('allowed_buyer_id', { length: 255 }),
  sourceInvoiceId: varchar('source_invoice_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const voucherClaims = pgTable('voucher_claims', {
  id: varchar('id', { length: 255 }).primaryKey(),
  voucherCode: varchar('voucher_code', { length: 100 }).notNull(),
  buyerId: varchar('buyer_id', { length: 255 }).notNull(),
  invoiceId: varchar('invoice_id', { length: 255 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow(),
});

export const articles = pgTable('articles', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: text('title').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  excerpt: text('excerpt'),
  content: text('content'),
  category: varchar('category', { length: 255 }),
  image: text('image'),
  keywords: text('keywords'),
  author: varchar('author', { length: 255 }).default('Admin'),
  date: varchar('date', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const banners = pgTable('banners', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 255 }),
  image: text('image').notNull(),
  link: text('link'),
  active: boolean('active').default(true),
  order: integer('order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const settings = pgTable('settings', {
  id: varchar('id', { length: 255 }).primaryKey(),
  value: jsonb('value').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: varchar('id', { length: 255 }).primaryKey(),
  provider: varchar('provider', { length: 50 }),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
