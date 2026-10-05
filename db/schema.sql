-- Schema migration from Firebase to Supabase PostgreSQL

-- 1. Helper function for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text AND role = 'admin'
  );
END;
$$;

-- 2. Tables
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(255) PRIMARY KEY,
  firebase_uid VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'buyer',
  profile JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  parent_id VARCHAR(255),
  icon TEXT,
  banner TEXT,
  discount_percent INTEGER DEFAULT 0,
  discount_active BOOLEAN DEFAULT false,
  discount_start TIMESTAMPTZ,
  discount_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT categories_parent_slug_unique UNIQUE (parent_id, slug)
);

CREATE TABLE IF NOT EXISTS public.products (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  slug VARCHAR(255),
  product_slug VARCHAR(255),
  permalink VARCHAR(255),
  category_id VARCHAR(255),
  category TEXT,
  category_slug VARCHAR(255),
  sub_category TEXT,
  sub_category_slug VARCHAR(255),
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  image TEXT,
  price NUMERIC(12,2) DEFAULT 0,
  price_retail NUMERIC(12,2) DEFAULT 0,
  price_wholesale NUMERIC(12,2) DEFAULT 0,
  min_wholesale INT DEFAULT 1,
  discount NUMERIC(5,2) DEFAULT 0,
  weight NUMERIC(10,2) DEFAULT 0,
  stock INT DEFAULT 0,
  sold INT DEFAULT 0,
  sales_count INT DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  size_variants JSONB DEFAULT '[]'::jsonb,
  specifications JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.carts (
  user_id VARCHAR(255) PRIMARY KEY,
  items JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id VARCHAR(255) PRIMARY KEY,
  buyer_id VARCHAR(255),
  buyer_name VARCHAR(255),
  buyer_email VARCHAR(255),
  buyer_phone VARCHAR(50),
  guest_uid VARCHAR(255),
  guest_session_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  payment_method VARCHAR(50),
  payment_gateway VARCHAR(50),
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  grand_total NUMERIC(12,2) DEFAULT 0,
  shipping_address JSONB DEFAULT '{}'::jsonb,
  shipping_selection JSONB DEFAULT '{}'::jsonb,
  biteship JSONB DEFAULT '{}'::jsonb,
  midtrans JSONB DEFAULT '{}'::jsonb,
  xendit JSONB DEFAULT '{}'::jsonb,
  voucher_code VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id VARCHAR(255) PRIMARY KEY,
  invoice_id VARCHAR(255),
  buyer_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id VARCHAR(255) PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  buyer_id VARCHAR(255),
  user_name VARCHAR(255),
  user_image TEXT,
  rating INT NOT NULL DEFAULT 5,
  comment TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vouchers (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) DEFAULT 'percentage',
  value NUMERIC(10,2) DEFAULT 0,
  max_discount NUMERIC(12,2) DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  voucher_kind VARCHAR(50) DEFAULT 'general',
  total_qty INT,
  used_count INT DEFAULT 0,
  max_uses INT DEFAULT 1,
  allowed_buyer_id VARCHAR(255),
  source_invoice_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voucher_claims (
  id VARCHAR(255) PRIMARY KEY,
  voucher_code VARCHAR(100) NOT NULL,
  buyer_id VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(255),
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.articles (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT,
  category VARCHAR(255),
  image TEXT,
  keywords TEXT,
  author VARCHAR(255) DEFAULT 'Admin',
  date VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.banners (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255),
  image TEXT NOT NULL,
  link TEXT,
  active BOOLEAN DEFAULT true,
  "order" INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type VARCHAR(50) NOT NULL UNIQUE,
  numbers JSONB,
  rotation_index INTEGER DEFAULT 0,
  chat_ids JSONB,
  value JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pickup_locations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT NOT NULL,
  postal_code VARCHAR(20),
  area_id_ref VARCHAR(255),
  area_id VARCHAR(255),
  area JSONB,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_products_category_slug ON public.products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_slug ON public.products(sub_category_slug);
CREATE INDEX IF NOT EXISTS idx_products_product_slug ON public.products(product_slug);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_discount_active ON public.categories(discount_active) WHERE discount_active = true;
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_id ON public.invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);
CREATE INDEX IF NOT EXISTS idx_pickup_locations_created_at ON public.pickup_locations(created_at DESC);

-- 4. RLS Configuration
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Products: Public read, Admin write
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products" ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can mutate products" ON public.products;
CREATE POLICY "Admin can mutate products" ON public.products FOR ALL USING (public.is_admin());

-- Categories: Public read, Admin write
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can mutate categories" ON public.categories;
CREATE POLICY "Admin can mutate categories" ON public.categories FOR ALL USING (public.is_admin());

-- Banners: Public read, Admin write
DROP POLICY IF EXISTS "Public can view banners" ON public.banners;
CREATE POLICY "Public can view banners" ON public.banners FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can mutate banners" ON public.banners;
CREATE POLICY "Admin can mutate banners" ON public.banners FOR ALL USING (public.is_admin());

-- Articles: Public read, Admin write
DROP POLICY IF EXISTS "Public can view articles" ON public.articles;
CREATE POLICY "Public can view articles" ON public.articles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can mutate articles" ON public.articles;
CREATE POLICY "Admin can mutate articles" ON public.articles FOR ALL USING (public.is_admin());

-- Users: Self read/update, Admin all
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid()::text = id OR public.is_admin());
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid()::text = id OR public.is_admin());

-- Carts: Self read/write
DROP POLICY IF EXISTS "Users can manage own cart" ON public.carts;
CREATE POLICY "Users can manage own cart" ON public.carts FOR ALL USING (auth.uid()::text = user_id OR public.is_admin());

-- Invoices: Buyer read/create, Admin all
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices" ON public.invoices FOR SELECT USING (auth.uid()::text = buyer_id OR public.is_admin());
DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
CREATE POLICY "Users can insert own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid()::text = buyer_id OR buyer_id IS NULL OR public.is_admin());
DROP POLICY IF EXISTS "Admin can update invoices" ON public.invoices;
CREATE POLICY "Admin can update invoices" ON public.invoices FOR ALL USING (public.is_admin());

-- Reviews: Public read, logged in create own
DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews;
CREATE POLICY "Public can view reviews" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can post reviews" ON public.reviews;
CREATE POLICY "Authenticated users can post reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid()::text = buyer_id OR public.is_admin());

-- Settings: Admin only
DROP POLICY IF EXISTS "Admin can manage settings" ON public.settings;
CREATE POLICY "Admin can manage settings" ON public.settings FOR ALL USING (public.is_admin());

-- Pickup Locations: Admin only
DROP POLICY IF EXISTS "Admin can manage pickup locations" ON public.pickup_locations;
CREATE POLICY "Admin can manage pickup locations" ON public.pickup_locations FOR ALL USING (public.is_admin());
