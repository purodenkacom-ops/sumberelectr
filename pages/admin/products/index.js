import { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/router';
import { auth, firestore, storage } from '../../../utils/firebase';
import {
  collection,
  getDocs,
  addDoc,
  query,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import AdminLayout from '../_layout';
import Link from 'next/link';
import Image from 'next/image';

// Fallback seeding ulasan di client jika API admin gagal (misal env admin tidak dikonfigurasi di lokal)
import reviewsData from '@/utils/reviews.json';

// Toggle client-side review seeding via env (default off to avoid Firestore rules issues)
const ALLOW_CLIENT_REVIEW_SEED = process.env.NEXT_PUBLIC_ALLOW_CLIENT_REVIEW_SEED === 'true';

// Simple image compression using browser canvas
const compressImage = (file, maxWidth = 800, quality = 0.7) =>
  new Promise((resolve) => {
    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob], file.name, { type: blob.type }));
          },
          'image/jpeg',
          quality
        );
      };
    };
    reader.readAsDataURL(file);
  });

// Slug generator
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text

const getCategorySlug = (category) => slugify(category || ''); // fallback

export default function ProductListPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryDocs, setCategoryDocs] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Form state without variants/wholesale
  const [form, setForm] = useState({
    name: '',
    category: '',
    stock: '',
    price: '',
    weight: '',
    sku: '',
    // discount fields kept in state only for backward compatibility but not used
    discount: '',
    discountStart: '',
    discountEnd: '',
    description: '',
    images: [null, null, null],
    video: '',
    existingImages: ['', '', ''],
    existingCloudinaryPublicIds: ['', '', ''],
    imageLinks: [] // untuk link gambar eksternal
  });
  const [showImageLinkPopup, setShowImageLinkPopup] = useState(false);
  // support multiple link inputs in popup
  const [newImageLinks, setNewImageLinks] = useState(['']);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showWholesaleDialog, setShowWholesaleDialog] = useState(false);
  const [editId, setEditId] = useState(null);
  const fileInputRefs = [useRef(), useRef(), useRef()];
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [checkedIds, setCheckedIds] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Helper: seed ulasan di client (fallback jika API gagal)
  const seedReviewsClient = async (productId, total = 10) => {
    try {
      const names = Array.isArray(reviewsData.names) ? reviewsData.names : [];
      const revs = Array.isArray(reviewsData.reviews) ? reviewsData.reviews : [];
      const start = new Date('2025-01-02T00:00:00Z').getTime();
      const end = new Date('2025-09-09T23:59:59Z').getTime();
      const randDate = () => new Date(start + Math.floor(Math.random() * (end - start + 1)));
      const tasks = [];
      for (let i = 0; i < total; i++) {
        const name = names[Math.floor(Math.random() * names.length)] || 'Pembeli';
        const pick = revs[Math.floor(Math.random() * revs.length)] || { comment: 'Bagus', rating: 5 };
        const rating = 3 + Math.floor(Math.random() * 3);
        const data = {
          productId: String(productId),
          name,
          comment: pick.comment,
          rating,
          createdAt: randDate()
        };
        tasks.push(addDoc(collection(firestore, 'reviews'), data));
      }
      await Promise.all(tasks);
      return true;
    } catch (e) {
      console.error('seedReviewsClient error', e);
      return false;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }
      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        router.push('/login');
        return;
      }
      const userData = userSnap.data();
      if (userData.role !== 'admin') {
        router.push('/unauthorized');
        return;
      }
      setUser(user);
      fetchProducts();
    });
    return () => unsubscribe();
  }, [router]);

  // Ambil daftar kategori realtime dari Firestore
  useEffect(() => {
    const qCats = query(collection(firestore, 'categories'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qCats, snap => {
      const list = [];
      snap.forEach(d => {
        const data = d.data() || {};
        list.push({
          id: d.id,
          name: data.name || 'Kategori',
          slug: data.slug || getCategorySlug(data.name),
          icon: data.icon || ''
        });
      });
      setCategoryDocs(list);
      setCategoriesLoading(false);
    }, () => {
      setCategoryDocs([]);
      setCategoriesLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const q = query(collection(firestore, 'products'));
    const snap = await getDocs(q);
    const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setProducts(list);
    setLoading(false);
  };

  // Delete product and images from storage
  const handleDelete = async (id) => {
    if (confirm('Delete this product?')) {
      const prod = products.find((p) => p.id === id);
      if (prod && prod.images) {
        for (const imgUrl of prod.images || []) {
          if (imgUrl) {
            try {
              // Get storage path from URL
              const match = imgUrl.match(/\/o\/(.*?)\?/);
              const path = match ? decodeURIComponent(match[1]) : null;
              if (path) {
                const imgRef = ref(storage, path);
                await deleteObject(imgRef);
              }
            } catch (e) {}
          }
        }
      }
      // Helper: derive Cloudinary public_id from a secure_url if not stored
      const derivePublicIdFromUrl = (url) => {
        try {
          if (!url || typeof url !== 'string') return '';
          const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || '';
          if (!cloudName) return '';
          // Expect pattern: https://res.cloudinary.com/<cloudName>/image/upload/v<version>/<path>.<ext>
          const basePattern = `res.cloudinary.com/${cloudName}/image/upload/`;
          const idx = url.indexOf(basePattern);
          if (idx === -1) return '';
          let tail = url.substring(idx + basePattern.length);
          // Strip query params
          tail = tail.split('?')[0];
          // Remove leading version segment v123456789/ if present
          tail = tail.replace(/^v\d+\//, '');
          // Remove extension
          const dotIdx = tail.lastIndexOf('.');
          if (dotIdx !== -1) tail = tail.substring(0, dotIdx);
          return tail;
        } catch { return ''; }
      };
      // Collect public_ids: prefer stored, fallback derive
      const publicIds = new Set();
      if (prod) {
        if (Array.isArray(prod.cloudinaryPublicIds)) {
          prod.cloudinaryPublicIds.forEach(pid => { if (pid) publicIds.add(pid); });
        }
        if (Array.isArray(prod.images)) {
          for (const u of prod.images) {
            if (!u) continue;
            const maybe = derivePublicIdFromUrl(u);
            if (maybe && ![...publicIds].some(p => p.endsWith(maybe))) {
              publicIds.add(maybe);
            }
          }
        }
      }
      // Delete Cloudinary images
      for (const pubId of publicIds) {
        try {
          const resp = await fetch('/api/delete-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_id: pubId })
          });
          if (!resp.ok) {
            console.warn('Cloudinary delete failed', pubId, resp.status);
          }
        } catch (e) {
          console.warn('Cloudinary delete error', pubId, e?.message || e);
        }
      }
      await deleteDoc(doc(firestore, 'products', id));
      setProducts(products.filter((p) => p.id !== id));
    }
  };

  // Form change handler
  const handleFormChange = (e) => {
    const { name, value, files } = e.target;
    if (name.startsWith('image')) {
      const idx = Number(name.replace('image', ''));
      const newImages = [...form.images];
      newImages[idx] = files[0];
      setForm({ ...form, images: newImages });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  // Handler untuk tambah link gambar eksternal
  const handleAddImageLink = () => {
    const toAdd = newImageLinks
      .map(s => (s || '').trim())
      .filter(s => s.length > 0);
    if (toAdd.length > 0) {
      setForm({ ...form, imageLinks: [...form.imageLinks, ...toAdd] });
      setNewImageLinks(['']);
      setShowImageLinkPopup(false);
    }
  };

  const handleRemoveImageLink = (idx) => {
    setForm({ ...form, imageLinks: form.imageLinks.filter((_, i) => i !== idx) });
  };

  // Popup multiple inputs handlers
  const handlePopupInputChange = (idx, value) => {
    const arr = [...newImageLinks];
    arr[idx] = value;
    setNewImageLinks(arr);
  };

  const handleAddPopupField = () => setNewImageLinks([...newImageLinks, '']);

  const handleRemovePopupField = (idx) => {
    if (newImageLinks.length === 1) {
      setNewImageLinks(['']);
      return;
    }
    setNewImageLinks(newImageLinks.filter((_, i) => i !== idx));
  };

  // Variant handlers removed (single-price model)

  // No variant weights: simple weight per product

  // Validate form
  const validateForm = () => {
    if (!form.name || !form.category || !form.stock || !form.price) {
      setError('Mohon lengkapi semua data produk.');
      return false;
    }
    if (isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setError('Harga harus diisi dan lebih dari 0.');
      return false;
    }
    if (isNaN(Number(form.stock)) || Number(form.stock) < 0) {
      setError('Stok harus angka 0 atau lebih.');
      return false;
    }
    if (form.weight !== '' && (isNaN(Number(form.weight)) || Number(form.weight) < 0)) {
      setError('Berat harus angka >= 0 (gram).');
      return false;
    }
    return true;
  };

  // Add or edit product
  const handleAddOrEditProduct = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!validateForm()) return;
    setUploading(true);

    // Upload & compress images
    let imageUrls = [...form.existingImages];
    let cloudPublicIds = [...form.existingCloudinaryPublicIds];
    // Gabungkan link gambar eksternal ke imageUrls
    if (form.imageLinks && form.imageLinks.length > 0) {
      imageUrls = [...imageUrls, ...form.imageLinks];
    }
    for (let i = 0; i < 3; i++) {
      if (form.images[i]) {
        const compressed = await compressImage(form.images[i]);
        const fd = new FormData();
        fd.append('file', compressed);
        const resp = await fetch('/api/upload-image', { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('cloudinary upload failed');
        const data = await resp.json();
        const url = data?.url;
        const pubId = data?.public_id || '';

        // If editing, delete old Firebase Storage image if replaced and was a Firebase URL
        if (editId && form.existingImages[i]) {
          try {
            const match = form.existingImages[i].match(/\/o\/(.*?)\?/);
            const path = match ? decodeURIComponent(match[1]) : null;
            if (path) {
              const imgRef = ref(storage, path);
              await deleteObject(imgRef);
            }
          } catch (e) {}
        }
        imageUrls[i] = url;
        cloudPublicIds[i] = pubId;
      }
    }

  const catDoc = categoryDocs.find(c => c.name === form.category);
    const categorySlug = catDoc?.slug || getCategorySlug(form.category);
    const categoryId = catDoc?.id || null;

    const productSlug = slugify(form.name);

    // Generate random sold, rating, and reviewCount
    const sold = Math.floor(Math.random() * (145 - 34 + 1)) + 34;
    const rating = (Math.random() * (5 - 4.5) + 4.5).toFixed(1);
    const reviewCount = Math.floor(Math.random() * (Math.min(240, sold) - 27 + 1)) + 27;

    const productData = {
      name: form.name,
      category: form.category,
      categoryId,
      categorySlug, // For SEO
      stock: Number(form.stock),
      weight: form.weight ? Number(form.weight) : null,
      // pricing: single price; keep priceRetail for compatibility, no wholesale
      price: Number(form.price),
      priceRetail: Number(form.price),
      priceWholesale: null,
      // discount fields removed from save
      description: form.description,
      images: imageUrls,
      cloudinaryPublicIds: cloudPublicIds,
      video: form.video,
      sku: form.sku || null,
      productSlug,
      createdAt: new Date(),
      sizeVariants: [],
      sold,
      rating: Number(rating),
      reviewCount
    };

    try {
      if (editId) {
        await setDoc(doc(firestore, 'products', editId), productData, { merge: true });
        setSuccess('Produk berhasil diubah.');
      } else {
        const docRef = await addDoc(collection(firestore, 'products'), productData);
        setSuccess('Produk berhasil ditambahkan.');

        // Seed bot reviews server-side for the new product
        try {
          const resp = await fetch('/api/seed-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: docRef.id })
          });
          if (!resp.ok) throw new Error('seed api not ok');
          await resp.json().catch(() => null);
        } catch (seedErr) {
          console.warn('Seed reviews API gagal, fallback ke client seed');
          if (ALLOW_CLIENT_REVIEW_SEED) {
            await seedReviewsClient(docRef.id, 10);
          } else {
            console.warn('Lewati client seeding (set NEXT_PUBLIC_ALLOW_CLIENT_REVIEW_SEED=true untuk mengaktifkan di dev)');
          }
        }
      }
      setForm({
        name: '',
        category: '',
        stock: '',
        price: '',
        weight: '',
        sku: '',
        discount: '',
        discountStart: '',
        discountEnd: '',
        description: '',
        images: [null, null, null],
        video: '',
        existingImages: ['', '', ''],
        existingCloudinaryPublicIds: ['', '', ''],
        imageLinks: []
      });
      fileInputRefs.forEach((ref) => ref.current && (ref.current.value = ''));
      setEditId(null);
      fetchProducts();
    } catch (err) {
      setError('Gagal menyimpan produk.');
    } finally {
      setUploading(false);
    }
  };

  // Edit product handler
  const handleEdit = (product) => {
    setForm({
      name: product.name || '',
      category: product.category || '',
      stock: product.stock || '',
      price: product.price || product.priceRetail || '',
      weight: product.weight || '',
      sku: product.sku || '',
      discount: product.discount || '',
      discountStart: product.discountStart || '',
      discountEnd: product.discountEnd || '',
      description: product.description || '',
      images: [null, null, null],
      video: product.video || '',
      existingImages: product.images || ['', '', ''],
      existingCloudinaryPublicIds: product.cloudinaryPublicIds || ['', '', ''],
      imageLinks: []
    });
    fileInputRefs.forEach((ref) => ref.current && (ref.current.value = ''));
    setEditId(product.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter & search
  const filteredProducts = products.filter((p) => {
    // Filter kategori dengan slug agar konsisten
    const matchCategory = filterCategory
      ? (p.categorySlug === getCategorySlug(filterCategory) || p.category === filterCategory)
      : true;

    // Pencarian produk: nama dan kategori, case-insensitive
    const searchTerm = search.trim().toLowerCase();
    const matchSearch =
      !searchTerm ||
      (p.name && p.name.toLowerCase().includes(searchTerm)) ||
      (p.category && p.category.toLowerCase().includes(searchTerm)) ||
      (p.categorySlug && p.categorySlug.toLowerCase().includes(searchTerm));

    return matchCategory && matchSearch;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Export Excel (menggunakan seluruh hasil filter, bukan hanya halaman saat ini)
  const handleDownloadExcel = () => {
    try {
      const data = filteredProducts.map((product) => ({
        'Product Name': product.name,
        'Category': product.category || '',
        'Long Description': product.description || '',
        'short description': product.description?.slice(0, 140) || '',
        Price: Number(product.priceRetail || product.priceWholesale || 0) || '',
        Currency: 'IDR',
        Stock: product.stock || 0,
        SKU: product.sku || '',
        'Package Weight': product.weight ? (Number(product.weight) / 1000) : '',
        'Product Image 1': product.images?.[0] || '',
        'Product Image 2': product.images?.[1] || '',
        'Product Image 3': product.images?.[2] || ''
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Produk');
      XLSX.writeFile(workbook, 'produk-list.xlsx');
    } catch (err) {
      console.error('Gagal mengekspor Excel:', err);
      alert('Gagal mengunduh Excel. Lihat console untuk detail.');
    }
  };

  // Template Excel untuk bulk upload
  const handleDownloadTemplate = () => {
    try {
      const headers = [
        'Product Name','Category','Long Description','short description','Price','Currency','Stock','SKU','Package Weight','Product Image 1','Product Image 2','Product Image 3'
      ];
      const firstCategory = categoryDocs[0]?.name || 'Elektrikal';
      const sampleRow = {
        'Product Name': 'Power Supply 12V 100W Yamasaki',
        'Category': firstCategory,
        'Long Description': 'Power Supply 12V 100W Yamasaki untuk rangkaian elektronik',
        'short description': 'Power Supply 12V 100W',
        'Price': 217500,
        'Currency': 'IDR',
        'Stock': 100,
        'SKU': 'PSU-12V-100W-YSK',
        'Package Weight': 0.8, // kg
        'Product Image 1': 'https://example.com/img1.jpg',
        'Product Image 2': 'https://example.com/img2.jpg',
        'Product Image 3': 'https://example.com/img3.jpg'
      };
      const wsData = [headers, headers.map(h => Object.prototype.hasOwnProperty.call(sampleRow,h) ? sampleRow[h] : '')];
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template-XL');
      // Tambahkan sheet daftar kategori untuk referensi pilihan
      const catSheetData = [['Name','Slug']].concat(
        (categoryDocs || []).map(c => [c.name, c.slug])
      );
      const wsCats = XLSX.utils.aoa_to_sheet(catSheetData);
      XLSX.utils.book_append_sheet(workbook, wsCats, 'Categories');

      const guide = [
        ['Kolom', 'Deskripsi'],
        ['Product Name', 'Nama produk'],
        ['Category', 'Nama kategori sesuai daftar pada sheet "Categories" (wajib)'],
        ['Long Description', 'Deskripsi panjang (boleh HTML sederhana)'],
        ['short description', 'Ringkasan singkat'],
        ['Price', 'Harga retail (IDR)'],
        ['Currency', 'Gunakan IDR'],
        ['Stock', 'Stok produk'],
        ['SKU', 'Kode stok unik (digunakan untuk update)'],
        ['Package Weight', 'Berat kemasan dalam kilogram (misal 0.8)'],
        ['Product Image 1..3', 'URL gambar produk']
      ];
      const wsGuide = XLSX.utils.aoa_to_sheet(guide);
      XLSX.utils.book_append_sheet(workbook, wsGuide, 'Petunjuk');
      XLSX.writeFile(workbook, 'template_bulk_produk_xl.xlsx');
    } catch (err) {
      console.error('Gagal membuat template:', err);
      alert('Gagal membuat template. Cek console.');
    }
  };

  // Bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkRows, setBulkRows] = useState([]); // parsed rows (raw)
  const [bulkErrors, setBulkErrors] = useState([]); // errors per row
  const [bulkProductsReady, setBulkProductsReady] = useState([]); // mapped product objects
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState('');
  const bulkFileInputRef = useRef();

  const openBulkModal = () => {
    setShowBulkModal(true);
    setBulkFile(null);
    setBulkParsing(false);
    setBulkRows([]);
    setBulkErrors([]);
    setBulkProductsReady([]);
  };
  const closeBulkModal = () => setShowBulkModal(false);

  const parseVariantsString = (str) => {
    if (!str || typeof str !== 'string') return [];
    return str.split(';').map(s => s.trim()).filter(Boolean).map(seg => {
      const [size, priceRetail, priceWholesale, weight] = seg.split('|').map(x => (x||'').trim());
      return {
        size: Number(size) || 0,
        priceRetail: Number(priceRetail) || 0,
        priceWholesale: Number(priceWholesale) || 0,
        weight: Number(weight) || 0
      };
    }).filter(v => v.size>0 && v.priceRetail>0 && v.priceWholesale>0 && v.weight>0);
  };

  const parseVariantColumns = (row) => {
    const variants = [];
    const maxVariants = 4; // batasi sesuai permintaan
    for (let i = 1; i <= maxVariants; i++) {
      const size = row[`variant${i}_size`];
      const priceRetail = row[`variant${i}_priceRetail`];
      const priceWholesale = row[`variant${i}_priceWholesale`];
      const weight = row[`variant${i}_weight`];
      if (
        (size === undefined || size === null || String(size).trim()==='') &&
        (priceRetail === undefined || String(priceRetail).trim()==='') &&
        (priceWholesale === undefined || String(priceWholesale).trim()==='') &&
        (weight === undefined || String(weight).trim()==='')
      ) {
        continue; // skip completely empty slot
      }
      const sv = {
        size: Number(size) || 0,
        priceRetail: Number(priceRetail) || 0,
        priceWholesale: Number(priceWholesale) || 0,
        weight: Number(weight) || 0
      };
      variants.push(sv);
    }
    return variants.filter(v => v.size>0 && v.priceRetail>0 && v.priceWholesale>0 && v.weight>0);
  };

  // Helpers for vendor-format sheet
  const stripHtml = (html) => {
    if (!html) return '';
    try {
      return String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    } catch { return String(html); }
  };
  const toGrams = (val) => {
    const n = Number(val);
    if (!isFinite(n) || n <= 0) return null;
    // If likely kg (e.g., 0.8), convert to grams
    return n < 10 ? Math.round(n * 1000) : Math.round(n);
  };

  const handleParseBulkFile = async () => {
    if (!bulkFile) return;
    setBulkParsing(true);
    setBulkErrors([]);
    setBulkProductsReady([]);
    setBulkSuccessMessage('');
    try {
      const arrayBuffer = await bulkFile.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      setBulkRows(rows);
      const errors = [];
      const mapped = [];
      const isVendorFormat = rows.length > 0 && Object.keys(rows[0] || {}).some(k => k.toLowerCase() === 'product name');
      rows.forEach((row, idx) => {
        const line = idx + 2; // header = line 1
        if (isVendorFormat) {
          const name = String(row['Product Name'] || row['product name'] || '').trim();
          const categoryRaw = String(row['Category'] || row['category'] || '').trim();
          const descriptionLong = row['Long Description'] || row['long description'] || '';
          const shortDesc = row['short description'] || row['Short Description'] || '';
          const price = Number(row['Price'] || row['price'] || 0);
          const stock = Number(row['Stock'] || row['stock'] || 0);
          const sku = String(row['SKU'] || row['sku'] || '').trim();
          const pkgWeight = row['Package Weight'] || row['package weight'] || '';
          const image1 = row['Product Image 1'] || row['product image 1'] || '';
          const image2 = row['Product Image 2'] || row['product image 2'] || '';
          const image3 = row['Product Image 3'] || row['product image 3'] || '';
          if (!name || !price || !stock) {
            errors.push(`Baris ${line}: Product Name, Price, dan Stock wajib diisi.`);
            return;
          }
          if (!categoryRaw) {
            errors.push(`Baris ${line}: Category wajib diisi.`);
            return;
          }
          // Cocokkan kategori by name atau slug (case-insensitive)
          const catDoc = categoryDocs.find(c => {
            const nm = (c.name || '').toString().toLowerCase();
            const sl = (c.slug || '').toString().toLowerCase();
            const key = categoryRaw.toLowerCase();
            return nm === key || sl === key;
          });
          if (!catDoc) {
            errors.push(`Baris ${line}: Category '${categoryRaw}' tidak ditemukan di database.`);
            return;
          }
          const categorySlug = catDoc.slug || getCategorySlug(categoryRaw);
          const categoryId = catDoc.id || null;
          const productSlug = slugify(name);
          const sold = Math.floor(Math.random() * (145 - 34 + 1)) + 34;
          const rating = Number((Math.random() * (5 - 4.5) + 4.5).toFixed(1));
          const reviewCount = Math.floor(Math.random() * (Math.min(240, sold) - 27 + 1)) + 27;
          const images = [image1, image2, image3].map(s => String(s || '').trim()).filter(Boolean);
          mapped.push({
            name,
            category: catDoc.name,
            categoryId,
            categorySlug,
            minWholesale: 1,
            stock,
            weight: toGrams(pkgWeight),
            description: typeof descriptionLong === 'string' && descriptionLong.includes('<') ? String(descriptionLong) : stripHtml(descriptionLong) || shortDesc,
            images,
            video: '',
            productSlug,
            createdAt: new Date(),
            sizeVariants: [],
            priceRetail: price,
            priceWholesale: price,
            sku: sku || undefined,
            sold,
            rating,
            reviewCount
          });
        } else {
          const name = String(row.name || '').trim();
          const category = String(row.category || '').trim();
          const stock = Number(row.stock);
          const minWholesale = Number(row.minWholesale);
          const discount = row.discount !== '' ? Number(row.discount) : 0;
          const discountStart = String(row.discountStart || '').trim();
          const discountEnd = String(row.discountEnd || '').trim();
          const description = String(row.description || '').trim();
          const video = String(row.video || '').trim();
          const variantsStr = String(row.variants || '').trim(); // legacy
          const imageLinksStr = String(row.imageLinks || '').trim(); // legacy
          // New variant columns parsing
          let sizeVariants = parseVariantColumns(row);
          // Fallback to legacy string if no valid new columns
          if (!sizeVariants.length) {
            sizeVariants = parseVariantsString(variantsStr);
          }
          // New image columns
          const imageCols = [];
          ['image1','image2','image3','image4','image5'].forEach(col => {
            if (row[col] && String(row[col]).trim() !== '') imageCols.push(String(row[col]).trim());
          });
          if (!name || !category || isNaN(stock) || stock <= 0 || isNaN(minWholesale) || minWholesale <= 0) {
            errors.push(`Baris ${line}: field wajib (name, category, stock>0, minWholesale>0) tidak valid.`);
            return;
          }
          if (!sizeVariants.length) {
            errors.push(`Baris ${line}: variants kosong / format salah.`);
            return;
          }
          if (sizeVariants.some(v => v.priceWholesale >= v.priceRetail)) {
            errors.push(`Baris ${line}: priceWholesale harus < priceRetail.`);
            return;
          }
          const legacyImages = imageLinksStr ? imageLinksStr.split(';').map(s=>s.trim()).filter(Boolean) : [];
          const imageLinks = imageCols.length ? imageCols : legacyImages;
          const catDoc = categoryDocs.find(c => c.name === category);
          const categorySlug = catDoc?.slug || getCategorySlug(category);
          const categoryId = catDoc?.id || null;
          const productSlug = slugify(name);
          const sold = Math.floor(Math.random() * (145 - 34 + 1)) + 34;
          const rating = Number((Math.random() * (5 - 4.5) + 4.5).toFixed(1));
          const reviewCount = Math.floor(Math.random() * (Math.min(240, sold) - 27 + 1)) + 27;
          mapped.push({
            name,
            category,
            categoryId,
            categorySlug,
            minWholesale,
            stock,
            weight: null,
            discount,
              discountStart,
              discountEnd,
            description,
            images: imageLinks, // hanya link eksternal dalam bulk
            video,
            productSlug,
            createdAt: new Date(),
            sizeVariants,
            sold,
            rating,
            reviewCount
          });
        }
      });
      setBulkErrors(errors);
      setBulkProductsReady(errors.length ? [] : mapped);
    } catch (err) {
      console.error(err);
      setBulkErrors(["Gagal membaca file: " + err.message]);
    } finally {
      setBulkParsing(false);
    }
  };

  const handleImportBulk = async () => {
    if (!bulkProductsReady.length) return;
    setBulkImporting(true);
    setBulkSuccessMessage('');
    try {
      // Ambil semua produk lama untuk mapping slug -> id
      const existingSnap = await getDocs(collection(firestore, 'products'));
      const slugToId = {};
      const skuToId = {};
      existingSnap.forEach(doc => {
        const data = doc.data();
        if (data.productSlug) slugToId[data.productSlug] = doc.id;
        if (data.sku) skuToId[String(data.sku).trim()] = doc.id;
      });

      // Firestore batch import (chunked)
      const { writeBatch, collection: coll, doc: fsDoc } = await import('firebase/firestore');
      const chunkSize = 400; // below 500 limit
      let importedIds = [];
      for (let i = 0; i < bulkProductsReady.length; i += chunkSize) {
        const batch = writeBatch(firestore);
        const slice = bulkProductsReady.slice(i, i + chunkSize);
        const idsInChunk = [];
        const prodRefInfo = {}; // slug -> { id, isNew }
        const seedPlan = []; // { id, isNew }
        for (const prod of slice) {
          const prodSlug = prod.productSlug;
          const sku = prod.sku ? String(prod.sku).trim() : '';
          let ref; let isNew = false;
          if (sku && skuToId[sku]) {
            ref = fsDoc(coll(firestore, 'products'), skuToId[sku]);
          } else if (prodSlug && slugToId[prodSlug]) {
            ref = fsDoc(coll(firestore, 'products'), slugToId[prodSlug]);
          } else {
            ref = fsDoc(coll(firestore, 'products')); // new doc with random id
            isNew = true;
          }
          batch.set(ref, prod, { merge: true });
          idsInChunk.push(ref.id);
          prodRefInfo[prodSlug] = { id: ref.id, isNew };
          seedPlan.push({ id: ref.id, isNew });
        }
        await batch.commit();
        importedIds = importedIds.concat(idsInChunk);

        // Seed reviews hanya untuk produk baru
        for (const info of seedPlan) {
          if (!info.isNew) continue;
          try {
            const resp = await fetch('/api/seed-reviews', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ productId: info.id })
            });
            if (!resp.ok) throw new Error('seed api not ok');
          } catch (seedErr) {
            console.warn('Seed reviews API gagal (bulk), fallback client seed untuk', info.id);
            if (ALLOW_CLIENT_REVIEW_SEED) {
              await seedReviewsClient(info.id, 10);
            } else {
              console.warn('Lewati client seeding (NEXT_PUBLIC_ALLOW_CLIENT_REVIEW_SEED=false).');
            }
          }
        }
      }
  setBulkSuccessMessage(`${bulkProductsReady.length} produk berhasil diimport.${ALLOW_CLIENT_REVIEW_SEED ? ' Ulasan otomatis ditambahkan untuk produk baru.' : ' (Catatan: seeding ulasan via client dimatikan; aktifkan NEXT_PUBLIC_ALLOW_CLIENT_REVIEW_SEED=true di dev atau pastikan API admin jalan.)'}`);
      fetchProducts();
      setBulkProductsReady([]);
    } catch (err) {
      console.error('Bulk import gagal:', err);
      setBulkErrors([`Import gagal: ${err.message}`]);
    } finally {
      setBulkImporting(false);
    }
  };

  // Checkbox handler
  const handleCheckProduct = (id, checked) => {
    setCheckedIds((prev) =>
      checked ? [...prev, id] : prev.filter((cid) => cid !== id)
    );
  };

  const handleCheckAll = (checked) => {
    setCheckedIds(checked ? paginatedProducts.map((p) => p.id) : []);
  };

  // Delete massal handler
  const handleDeleteMassal = async () => {
    setShowDeleteDialog(false);
    if (!checkedIds.length) return;
    for (const id of checkedIds) {
      await handleDelete(id);
    }
    setCheckedIds([]);
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-primary mb-6">Manajemen Produk</h1>

          {/* Form Tambah/Ubah Produk */}
          <form
            onSubmit={handleAddOrEditProduct}
            className="bg-red-50 border border-red-200 rounded-xl p-6 mb-10 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-red-700 mb-4">
              {editId ? 'Ubah Produk' : 'Tambah Produk Baru'}
            </h2>
            {error && (
              <div className="bg-red-100 text-red-700 text-sm p-2 mb-3 rounded">{error}</div>
            )}
            {success && (
              <div className="bg-green-100 text-green-700 text-sm p-2 mb-3 rounded">{success}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-1">Nama Produk</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nama Produk"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kategori</label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleFormChange}
                  required
                  disabled={categoriesLoading}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">{categoriesLoading ? 'Memuat kategori...' : 'Pilih Kategori'}</option>
                  {categoryDocs.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
                {!categoriesLoading && categoryDocs.length === 0 && (
                  <p className="text-[11px] text-red-600 mt-1">
                    Belum ada kategori. Tambahkan di halaman Settings.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Stok</label>
                <input
                  type="number"
                  name="stock"
                  value={form.stock}
                  onChange={handleFormChange}
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Stok"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Harga (IDR)</label>
                <input
                  type="number"
                  name="price"
                  value={form.price}
                  onChange={handleFormChange}
                  required
                  min={0}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Harga retail"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Berat Item (gram)</label>
                <input
                  type="number"
                  name="weight"
                  value={form.weight}
                  onChange={handleFormChange}
                  min="0"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Berat produk dalam gram"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SKU (opsional)</label>
                <input
                  type="text"
                  name="sku"
                  value={form.sku}
                  onChange={handleFormChange}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Contoh: PSU-12V-100W-YSK"
                />
              </div>
              {/*<div>
                <label className="block text-sm font-medium mb-1">Berat Item (gram)</label>
                <input
                  type="number"
                  name="weight"
                  value={form.weight}
                  onChange={handleFormChange}
                  required={!checkHasVariantWeights()}
                  min="1"
                  disabled={checkHasVariantWeights()}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Berat produk dalam gram"
                />
                {checkHasVariantWeights() && (
                  <p className="text-xs text-gray-600 mt-1">Berat global dinonaktifkan karena setiap varian memiliki berat. Hapus berat varian jika ingin pakai berat global.</p>
                )}
              </div>*/}
              {/* Discount fields removed by request */}
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Deskripsi Produk</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Deskripsi produk, detail, keunggulan, dll."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Link Video Youtube (Opsional)</label>
                <input
                  type="text"
                  name="video"
                  value={form.video}
                  onChange={handleFormChange}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://youtube.com/..."
                />
              </div>
              
              {[0, 1, 2].map((idx) => (
                <div key={idx}>
                  <label className="block text-sm font-medium mb-1">{`Upload Gambar ${idx + 1}`}</label>
                  <input
                    type="file"
                    name={`image${idx}`}
                    accept="image/*"
                    ref={fileInputRefs[idx]}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {/* Show existing image if editing */}
                  {editId && form.existingImages[idx] && (
                    <Image
                      src={form.existingImages[idx]}
                      alt={`Gambar ${idx + 1}`}
                      width={64}
                      height={64}
                      className="mt-2 rounded border object-cover"
                      style={{ width: '64px', height: '64px' }}
                      priority
                    />
                  )}
                </div>
              ))}
              {/* Tombol Add via Link */}
              <div className="md:col-span-2 mt-2">
                <button
                  type="button"
                  className="bg-primary text-white px-3 py-1 rounded mr-2 hover:bg-blueDark"
                  onClick={() => setShowImageLinkPopup(true)}
                >
                  Add via Link
                </button>
                {/* Tampilkan daftar link gambar eksternal */}
                {form.imageLinks && form.imageLinks.length > 0 && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium mb-1">Gambar dari Link:</label>
                    <ul>
                      {form.imageLinks.map((link, idx) => (
                        <li key={idx} className="flex items-center gap-2 mb-1">
                          <span className="text-xs break-all">{link}</span>
                          <button type="button" className="text-red-500 text-xs" onClick={() => handleRemoveImageLink(idx)}>Hapus</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {/* Popup input link gambar eksternal */}
              {showImageLinkPopup && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-xs">
                    <h3 className="text-lg font-semibold mb-2">Tambah Link Gambar</h3>
                    <div className="space-y-2 mb-3">
                      {newImageLinks.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={val}
                            onChange={e => handlePopupInputChange(idx, e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                            placeholder="https://..."
                          />
                          {idx === newImageLinks.length - 1 ? (
                            <button type="button" className="text-green-600 text-lg px-2" onClick={handleAddPopupField} title="Tambah field">+</button>
                          ) : (
                            <button type="button" className="text-red-500 text-lg px-2" onClick={() => handleRemovePopupField(idx)} title="Hapus field">−</button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="bg-green-500 text-white px-3 py-1 rounded" onClick={handleAddImageLink}>Tambah</button>
                      <button type="button" className="bg-gray-300 px-3 py-1 rounded" onClick={() => { setShowImageLinkPopup(false); setNewImageLinks(['']); }}>Batal</button>
                    </div>
                  </div>
                </div>
              )}
            {/* penutup div form gambar */}
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="mt-6 bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-70"
            >
              {uploading ? (editId ? 'Mengubah...' : 'Uploading...') : (editId ? 'Ubah Produk' : 'Tambah Produk')}
            </button>
          </form>

          {/* Filter & Search */}
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk..."
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              disabled={categoriesLoading}
            >
              <option value="">{categoriesLoading ? 'Memuat...' : 'Semua Kategori'}</option>
              {categoryDocs.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 mb-2">
            <button
              onClick={handleDownloadExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Download Excel
            </button>
            <button
              onClick={openBulkModal}
              className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-blueDark transition"
            >
              Bulk Upload (Excel)
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={checkedIds.length === 0}
              className={`bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition ${checkedIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Delete Massal
            </button>
          </div>

          {/* Tabel Produk */}
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-red-100 rounded-xl shadow-sm">
              <thead className="bg-red-700 text-white">
                <tr>
                  <th className="py-3 px-4 text-left">
                    <input
                      type="checkbox"
                      checked={paginatedProducts.length > 0 && paginatedProducts.every(p => checkedIds.includes(p.id))}
                      onChange={e => handleCheckAll(e.target.checked)}
                    />
                  </th>
                  <th className="py-3 px-4 text-left">Gambar</th>
                  <th className="py-3 px-4 text-left">Nama</th>
                  <th className="py-3 px-4 text-left">Kategori</th>
                  <th className="py-3 px-4 text-left">Kategori Slug</th>
                  <th className="py-3 px-4 text-left">Stok</th>
                  <th className="py-3 px-4 text-left">Berat (g)</th>
                  <th className="py-3 px-4 text-left">Harga</th>
                  <th className="py-3 px-4 text-left">Video</th>
                  <th className="py-3 px-4 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={13} className="text-center py-6">Loading...</td>
                  </tr>
                )}

                {!loading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={13} className="text-center py-6 text-gray-500">Belum ada produk.</td>
                  </tr>
                )}

                {!loading && filteredProducts.length > 0 && (
                  paginatedProducts.map((product) => {
                    const previewImage = (product.images || []).find(u => u && String(u).trim() !== '') || null;
                    return (
                      <tr key={product.id} className="border-b border-gray-100">
                        <td className="py-2 px-4">
                          <input
                            type="checkbox"
                            checked={checkedIds.includes(product.id)}
                            onChange={e => handleCheckProduct(product.id, e.target.checked)}
                          />
                        </td>
                        <td className="py-2 px-4">
                          {previewImage ? (
                            <Image
                              src={previewImage}
                              alt={product.name}
                              width={48}
                              height={48}
                              className="w-12 h-12 object-cover rounded-md border"
                              style={{ width: '48px', height: '48px' }}
                              priority
                            />
                          ) : null}
                        </td>
                        <td className="py-2 px-4 font-semibold">{product.name}</td>
                        <td className="py-2 px-4">{product.category}</td>
                        <td className="py-2 px-4">{product.categorySlug || getCategorySlug(product.category) }</td>
                        <td className="py-2 px-4">{product.stock}</td>
                        <td className="py-2 px-4">{product.weight ? `${product.weight}g` : '-'}</td>
                        <td className="py-2 px-4">{product.price || product.priceRetail ? `Rp${Number(product.price || product.priceRetail).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="py-2 px-4">
                          {product.video ? (
                            <a
                              href={product.video}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Video
                            </a>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-4">
                          <button
                            onClick={() => handleEdit(product)}
                            className="text-blue-600 hover:underline mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dialog Konfirmasi Delete Massal */}
          {showDeleteDialog && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
                <h2 className="text-lg font-semibold mb-4 text-red-700">Konfirmasi Delete Massal</h2>
                <p className="mb-4 text-gray-700">
                  Anda akan menghapus <b>{checkedIds.length}</b> produk sekaligus. Tindakan ini tidak dapat dibatalkan.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    className="bg-gray-300 px-4 py-2 rounded"
                    onClick={() => setShowDeleteDialog(false)}
                  >Batal</button>
                  <button
                    className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
                    onClick={handleDeleteMassal}
                  >Hapus Semua</button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Upload Modal */}
          {showBulkModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start md:items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg p-6 relative">
                <button
                  onClick={closeBulkModal}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                  aria-label="Close"
                >✕</button>
                <h2 className="text-xl font-semibold mb-4">Bulk Upload Produk</h2>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"
                    type="button"
                  >Download Template</button>
                </div>
                <ol className="list-decimal ml-5 text-sm text-gray-700 space-y-1 mb-4">
                  <li>Download template Excel (akan ditambahkan).</li>
                  <li>Isi data sesuai kolom yang disediakan.</li>
                  <li>Upload file dan periksa preview sebelum import.</li>
                </ol>
                <div className="border rounded p-4 mb-4 bg-gray-50">
                  <p className="text-sm font-medium mb-2">Upload File (.xlsx / .xls)</p>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="block w-full text-sm"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  />
                  {bulkFile && (
                    <p className="mt-2 text-xs text-gray-600">File dipilih: {bulkFile.name}</p>
                  )}
                  {/* Placeholder tombol parsing (akan diisi) */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleParseBulkFile}
                      disabled={!bulkFile || bulkParsing}
                      className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                    >{bulkParsing ? 'Memproses...' : 'Parse File'}</button>
                    <button
                      type="button"
                      onClick={handleImportBulk}
                      disabled={bulkProductsReady.length === 0 || bulkImporting}
                      className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
                    >{bulkImporting ? 'Mengimport...' : 'Import ke Database'}</button>
                  </div>
                </div>
                {bulkSuccessMessage && (
                  <div className="mb-4 bg-green-100 text-green-700 text-xs p-2 rounded">{bulkSuccessMessage}</div>
                )}
                {bulkParsing && <p className="text-sm text-blue-600 mb-2">Memproses file...</p>}
                {bulkErrors.length > 0 && (
                  <div className="mb-4 max-h-40 overflow-auto border rounded p-3 bg-red-50 text-xs text-red-700 space-y-1">
                    {bulkErrors.map((er, i) => <div key={i}>{er}</div>)}
                  </div>
                )}
                {bulkProductsReady.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-sm mb-2">Preview ({bulkProductsReady.length} produk siap):</h3>
                    <div className="max-h-56 overflow-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-1 text-left">Nama</th>
                            <th className="p-1 text-left">Kategori</th>
                            <th className="p-1 text-left">Stok</th>
                            <th className="p-1 text-left">Varian</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkProductsReady.slice(0,30).map((bp,i) => (
                            <tr key={i} className="odd:bg-white even:bg-gray-50">
                              <td className="p-1">{bp.name}</td>
                              <td className="p-1">{bp.category}</td>
                              <td className="p-1">{bp.stock}</td>
                              <td className="p-1">{bp.sizeVariants?.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {bulkProductsReady.length > 30 && (
                      <p className="text-[10px] text-gray-500 mt-1">Menampilkan 30 pertama dari {bulkProductsReady.length}.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}