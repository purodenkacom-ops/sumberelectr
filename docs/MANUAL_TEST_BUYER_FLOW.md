# 🧪 Manual Test Simulasi - Buyer Flow

## Prerequisites
- Server dev running: `npm run dev`
- Supabase migration sudah dijalankan
- Browser: Chrome/Firefox

---

## Test Flow

### 1. Register Buyer Baru
**URL:** http://localhost:3001/register-buyer

**Data Test:**
- Email: `testbuyer@gmail.com` (atau email valid lainnya)
- Password: `Test123456!`
- Nama: `Buyer Test Manual`
- Phone: `081234567890`

**Expected:**
- ✅ Redirect ke `/login`
- ✅ Success message tampil

---

### 2. Login Buyer
**URL:** http://localhost:3001/login

**Credentials:**
- Email: `testbuyer@gmail.com`
- Password: `Test123456!`

**Expected:**
- ✅ Redirect ke `/account`
- ✅ Nama buyer tampil di navbar

---

### 3. Upload Alamat
**URL:** http://localhost:3001/account

**Scroll ke section "Alamat Pengiriman"**

**Data Test:**
- Nama Penerima: `Buyer Test`
- Phone: `081234567890`
- Address: `Jl. Test No. 123, RT 01/RW 02`
- Area: Ketik "Jakarta" → pilih salah satu
- Kode Pos: `12345`
- Lat/Long: (opsional, bisa kosong)

**Action:**
- Klik **"Tambah Alamat"**

**Expected:**
- ✅ Alamat muncul di list
- ✅ Badge "Utama" tampil

---

### 4. Browse & Add to Cart
**URL:** http://localhost:3001/category/schneider

**Action:**
1. Pilih subcategory (e.g., "MCCB")
2. Klik salah satu product card
3. Di product detail page:
   - Pilih quantity: `2`
   - Klik **"+ Keranjang"**

**Expected:**
- ✅ Popup konfirmasi tampil
- ✅ Cart count di navbar update (badge angka)

---

### 5. View Cart
**URL:** http://localhost:3001/cart

**Expected:**
- ✅ Produk yang ditambahkan tampil
- ✅ Total harga benar
- ✅ Button "Checkout" aktif

---

### 6. Checkout
**Action di /cart:**
1. Pilih alamat pengiriman (radio button)
2. Pilih shipping (JNE/JNT/etc)
3. Pilih payment method (Transfer Bank/COD)
4. Klik **"Proses Checkout"**

**Expected:**
- ✅ Redirect ke `/account` atau order detail
- ✅ Order muncul di "Pesanan Saya"
- ✅ Status: `pending`

---

### 7. Admin - View Order
**URL:** http://localhost:3001/admin/orders

**Login sebagai Admin:**
- Email: `arthurcodec@gmail.com` (atau admin lain dari database)
- Password: (password admin yang valid)

**Expected:**
- ✅ Order test buyer tampil di list
- ✅ Status: `pending`
- ✅ Nama buyer: `Buyer Test Manual`

---

### 8. Admin - Update Status Order

**Action:**
1. Klik order test buyer
2. Update status sequence:
   - `pending` → **"Packing"** (klik button "Mark as Packing")
   - `packing` → **"Shipped"** (klik button "Mark as Shipped")
     - Input resi: `TEST123456`
   - `shipped` → **"Delivered"** (klik button "Mark as Delivered")

**Expected setiap update:**
- ✅ Status berubah di admin list
- ✅ Timestamp update
- ✅ (Optional) Notif ke buyer via Telegram/WhatsApp jika configured

---

### 9. Buyer - Check Order Status
**URL:** http://localhost:3001/account

**Scroll ke "Pesanan Saya"**

**Expected:**
- ✅ Order tampil dengan status terbaru: `delivered`
- ✅ Resi number tampil: `TEST123456`
- ✅ Button **"Beri Ulasan"** aktif

---

### 10. Buyer - Submit Review
**Action:**
1. Klik **"Beri Ulasan"** pada order
2. Fill form review:
   - Rating: **5 stars** (klik bintang)
   - Review text: `Produk bagus, pengiriman cepat. Recommended!`
3. Klik **"Kirim Ulasan"**

**Expected:**
- ✅ Success message tampil
- ✅ Review muncul di product detail page
- ✅ Button "Beri Ulasan" hilang (sudah reviewed)

---

### 11. Verify Review on Product Page
**URL:** http://localhost:3001/product/[product-slug]

**Scroll ke section "Ulasan Pembeli"**

**Expected:**
- ✅ Review test buyer tampil
- ✅ Rating 5 stars
- ✅ Text review: `Produk bagus...`
- ✅ Nama: `Buyer Test Manual`
- ✅ Timestamp tampil

---

## ✅ Test Complete Checklist

- [ ] Register buyer baru
- [ ] Login buyer
- [ ] Upload alamat
- [ ] Add product to cart
- [ ] Checkout order
- [ ] Admin view order
- [ ] Admin update status: packing
- [ ] Admin update status: shipped (+ resi)
- [ ] Admin update status: delivered
- [ ] Buyer view order status
- [ ] Buyer submit review
- [ ] Review tampil di product page

---

## 🧹 Cleanup Test Data

Setelah semua test sukses, hapus data test dengan script:

```bash
node scripts/cleanup-test-buyer.js testbuyer@gmail.com
```

Script akan hapus:
- User profile dari `users` table
- Auth user dari Supabase Auth
- Cart items dari `carts` table
- Orders dari `orders` & `invoices` table
- Reviews dari `reviews` table

---

## 🐛 Troubleshooting

### Issue: Order tidak muncul di admin
**Solution:** Check RLS policy untuk `invoices` & `orders` table

### Issue: Review tidak tersimpan
**Solution:** Check RLS policy untuk `reviews` table - buyer harus bisa insert

### Issue: Cart count tidak update
**Solution:** Check `carts` table - user_id harus match dengan auth user

### Issue: Status update gagal
**Solution:** Check admin role di `users` table - role harus `admin`

---

## 📊 Database Tables Affected

Test ini akan create/modify data di:
- ✅ `auth.users` - Supabase Auth
- ✅ `public.users` - User profile
- ✅ `public.carts` - Cart items
- ✅ `public.invoices` - Order data
- ✅ `public.orders` - Order items
- ✅ `public.reviews` - Product reviews

Pastikan semua RLS policies sudah configured dengan benar!
