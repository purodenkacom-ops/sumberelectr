import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove, collection, getDocs, query, where, runTransaction, increment, setDoc } from 'firebase/firestore'; // (array ops optional)
import { getCoordinates } from '@/utils/biteship';
import { auth, firestore } from '@/utils/firebase'; // 1. Pastikan 'auth' di-import
import { onAuthStateChanged } from 'firebase/auth'; // 1. Import onAuthStateChanged
// Navbar and Footer intentionally omitted on payment page to provide a focused checkout flow
import Image from 'next/image'; // 1. Pastikan Image di-import
import Script from 'next/script';

// === PATCH COURIERS ===
// Hapus JNE Trucking dari pilihan pengiriman, tambahkan J&T ke COD_ALLOWED_COURIERS
const COURIERS = [
  { code: 'jne', label: 'JNE' },
  { code: 'jnt', label: 'J&T' },
  { code: 'tiki', label: 'TIKI' },
  { code: 'sicepat', label: 'SiCepat' },
  { code: 'anteraja', label: 'AnterAja' },
  { code: 'grab', label: 'Grab (Instant)' },
  { code: 'gojek', label: 'Gojek (Instant)' },
  { code: 'lalamove', label: 'Lalamove (Instant)' },
  // { code: 'jne_trucking', label: 'JNE Trucking' }, // DIHAPUS
];
// COD removed: no allowed couriers needed

const ORIGIN_LAT = Number(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT);
const ORIGIN_LNG = Number(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG);
const INSTANT_RADIUS_KM = Number(process.env.NEXT_PUBLIC_INSTANT_MAX_RADIUS_KM || process.env.INSTANT_MAX_RADIUS_KM || 40);

const COD_DISABLED = true; // COD permanently disabled
// const COD_FEE_RATE = 0.05; // no longer used
// const COD_PENDING_STATUS = 'waiting'; // no longer used
const TRANSFER_FEE = 4000; // Biaya pembayaran untuk metode Transfer

// Haversine
function calcDistanceKm(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Tambah helper parse provinsi (di luar komponen atau atas file)
const PROVINCE_KEYWORDS = [
  // Jawa
  'BANTEN',
  'DKI JAKARTA',
  'JAWA BARAT',
  'JAWA TENGAH',
  'DI YOGYAKARTA',
  'DAERAH ISTIMEWA YOGYAKARTA',
  'JAWA TIMUR',

  // Sumatra (kecuali Aceh & Sumbar)
  'LAMPUNG',
  'SUMATERA SELATAN',
  'BANGKA BELITUNG',
  'BENGKULU',
  'RIAU',
  'KEPULAUAN RIAU',
  'JAMBI',

  // Kalimantan
  'KALIMANTAN BARAT',
  'KALIMANTAN TENGAH',
  'KALIMANTAN SELATAN',
  'KALIMANTAN TIMUR',
  'KALIMANTAN UTARA',

  // Sulawesi
  'SULAWESI UTARA',
  'SULAWESI TENGAH',
  'SULAWESI SELATAN',
  'SULAWESI TENGGARA',
  'GORONTALO',
  'SULAWESI BARAT',

  // Bali & NTB
  'BALI',
  'NUSA TENGGARA BARAT'
];

function normalizeProvinceName(raw='') {
  const up = raw.toUpperCase();
  // Normalisasi variasi
  if (up.includes('DAERAH ISTIMEWA YOGYAKARTA') || up === 'DIY' || up.includes('YOGYAKARTA')) {
    return 'DI YOGYAKARTA';
  }
  return up;
}
function detectProvinceFromAddress(address='') {
  const up = address.toUpperCase();
  for (const p of PROVINCE_KEYWORDS) {
    if (up.includes(p)) return p;
    // Handle "JAWA BARAT" etc might appear truncated
    if (p.startsWith('JAWA')) {
      const shortForm = p.replace('JAWA ','JAWA');
      if (up.includes(shortForm)) return p;
    }
    if (p.startsWith('SUMATERA')) {
      const shortForm = p.replace('SUMATERA ','SUMATERA');
      if (up.includes(shortForm)) return p;
    }
    if (p.startsWith('KALIMANTAN ')) {
      const shortForm = p.replace('KALIMANTAN ','KALIMANTAN');
      if (up.includes(shortForm)) return p;
    }
    if (p.startsWith('SULAWESI ')) {
      const shortForm = p.replace('SULAWESI ','SULAWESI');
      if (up.includes(shortForm)) return p;
    }
    if (p.startsWith('BALI')) {
      const shortForm = p.replace('BALI','BALI');
      if (up.includes(shortForm)) return p;
    }
    if (p.startsWith('NUSA TENGGARA BARAT')) {
      const shortForm = p.replace('NUSA TENGGARA BARAT','NUSA TENGGARA BARAT');
      if (up.includes(shortForm)) return p;
    }
    
  }
  return '';
}

export default function PaymentPage() {
  const router = useRouter();
  const { invoiceId } = router.query;

  // 2. Tambahkan state untuk status autentikasi
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null); // Gunakan state ini sebagai sumber utama data user

  // === Tambahkan state shippingConfirmed (BELUM ADA) ===
  // True jika sudah ada shippingSelection tersimpan di invoice ketika load.
  const [shippingConfirmed, setShippingConfirmed] = useState(false); // <-- ADD

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCourier, setSelectedCourier] = useState('jne');
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [buyerNote, setBuyerNote] = useState('');
  const [productImages, setProductImages] = useState({});
  const [needInstantLocation,setNeedInstantLocation] = useState(false);
  const [addressInput,setAddressInput] = useState('');
  const [showMap,setShowMap] = useState(false);
  const [mapReady,setMapReady] = useState(false);
  const [pickedCoord,setPickedCoord] = useState(null);
  const [instantError,setInstantError] = useState('');
  const [userInstantCoord, setUserInstantCoord] = useState(null); // koordinat tersimpan di user
  const [autoUsingSavedInstant, setAutoUsingSavedInstant] = useState(false);
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('midtrans'); // default to Midtrans
  // === FIX: Tambahkan alias supaya tidak ReferenceError ===
  // Gunakan satu sumber kebenaran (codEligible). Jika nanti ada logika tambahan,
  // tinggal ubah perhitungan effectiveCodEligible di sini.
  // COD removed
  const effectiveCodEligible = false;
  const [provinceDetected, setProvinceDetected] = useState('');
  const [provinceDebug, setProvinceDebug] = useState('');
  const mapContainerRef = typeof window !== 'undefined' ? (window._instantMapRef ||= { current:null }): {current:null};
  const mapObjRef = typeof window !== 'undefined' ? (window._instantMapObjRef ||= { current:null }): {current:null};
  const markerRef = typeof window !== 'undefined' ? (window._instantMarkerRef ||= { current:null }): {current:null};

  // Tambahkan state untuk voucher input dan error
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [voucherObj, setVoucherObj] = useState(null);

  // Tambah state daftar voucher
  const [voucherList, setVoucherList] = useState([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  // Allow editing shipping before payment
  const [editingShipping, setEditingShipping] = useState(false);

  // Claim voucher modal state
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimedCodesMap, setClaimedCodesMap] = useState({}); // { CODE: true }

  // === XENDIT state ===
  const [xenditLoading, setXenditLoading] = useState(false);
  const [xenditError, setXenditError] = useState('');

  // Fetch invoice & user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Pengguna sudah login, ambil data lengkapnya dari Firestore
        const userRef = doc(firestore, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUser({ uid: currentUser.uid, ...userSnap.data() });
        } else {
          setUser(currentUser); // Fallback jika dokumen user belum ada
        }
      } else {
        // Pengguna tidak login
        setUser(null);
      }
      // Tandai bahwa proses pengecekan autentikasi sudah selesai
      setAuthReady(true);
    });

    // Cleanup listener saat komponen di-unmount
    return () => unsubscribe();
  }, []);

  // 4. Modifikasi useEffect utama untuk bergantung pada 'authReady'
  useEffect(() => {
    // Jangan jalankan apapun jika invoiceId belum ada atau auth belum siap
    if (!invoiceId || !authReady) return;

    const fetchInvoice = async () => {
      try {
        const ref = doc(firestore, 'invoices', String(invoiceId));
        const snap = await getDoc(ref);

        if (!snap.exists()) throw new Error('Invoice tidak ditemukan');
        const inv = snap.data();
        // Verifikasi kepemilikan invoice: jika invoice memiliki buyerId, maka harus cocok dengan user saat ini.
        if (inv.buyerId) {
          if (!user || inv.buyerId !== user.uid) {
            throw new Error('Anda tidak memiliki izin untuk mengakses invoice ini.');
          }
        }
        setInvoice(inv);
        setBuyerNote(inv.buyerNote || '');
      } catch (err) {
        // Fallback: try server API (works for guest without Firestore permission)
        try {
          const r = await fetch(`/api/invoices/get?invoiceId=${encodeURIComponent(String(invoiceId))}`);
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || 'Gagal memuat invoice');
          const inv = data;
          // Server returns full doc; for guests buyerId is null, so allow
          setInvoice(inv);
          setBuyerNote(inv.buyerNote || '');
        } catch (e2) {
          setError(err?.message || e2?.message || 'Gagal memuat invoice');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId, authReady, user, router]); // Tambahkan 'user' dan 'router' ke dependencies

  // Tambahkan alamat toko (origin) dari invoice/store/user, sesuaikan field sesuai data Anda
  const getOriginAddress = () => {
    // Contoh: dari invoice.storeAddress, atau hardcode alamat toko
    return invoice?.storeAddress || process.env.NEXT_PUBLIC_STORE_ADDRESS || 'Jl. Toko Utama, Jakarta';
  };

  // Ambil alamat tujuan dari user/address
  const getDestinationAddress = () => {
    return user?.address || invoice?.shippingAddress?.address || invoice?.buyerAddress || '';
  };

  // Fetch Biteship services via API
  useEffect(() => {
    if (!invoice || !selectedCourier) return;

    function normalizeItemWeight(raw) {
      const wNum = Number(raw);
      if (!Number.isFinite(wNum) || wNum <= 0) return 200; // fallback 200 g
      // Heuristik: angka kecil dengan desimal dianggap kg (misal 0.5 => 500g, 1 => 1000g)
      // Angka kecil tanpa desimal (<10) cenderung gram (misal 5 => 5g), kecuali tepat 1 yang sering berarti 1kg
      const rawStr = String(raw);
      const hasDecimal = rawStr.includes('.') || rawStr.includes(',');
      if (wNum < 10) {
        if (hasDecimal || wNum === 1) return Math.round(wNum * 1000); // kg -> gram
        return Math.round(wNum); // treat as grams
      }
      // >= 10 anggap sudah gram
      return Math.round(wNum);
    }

    function buildMergedItem(inv) {
      const totalGram = (inv.items || []).reduce(
        (s,i)=> s + normalizeItemWeight(i.weight) * (Number(i.quantity)||1), 0
      );
      // Dimensi kecil supaya volumetrik tidak melampaui berat (10*10*5 /6000 = 0.083 kg)
      return [{
        name: 'All Items',
        description: 'Merged Parcel',
        value: Number(inv.subtotal) || 0,
        weight: totalGram < 1 ? 200 : totalGram, // safeguard
        quantity: 1,
        length: 10,
        width: 10,
        height: 5
      }];
    }

    const fetchServices = async () => {
  const isInstant = ['grab','gojek','lalamove'].includes(selectedCourier);
      if (isInstant && !pickedCoord) {
        if (autoUsingSavedInstant) {
          // lanjut
        } else {
          setNeedInstantLocation(true);
          setServices([]);
          return;
        }
      }
      setNeedInstantLocation(false);
      setServices([]);
      setSelectedService('');
      setShippingCost(0);

      try {
        // PILIH MODE MERGE UNTUK TEST
        const USE_MERGE = true;

        const detailedItems = invoice.items.map(item => {
          const nw = normalizeItemWeight(item.weight);
          // Dimensi kecil default
          const length = item.length || 10;
          const width  = item.width  || 10;
          const height = item.height || 5;
          const volumetricKg = (length * width * height) / 6000;
          const actualKg = (nw / 1000);
          console.log('[Biteship Debug] item', item.name, {
            weightGram: nw,
            quantity: item.quantity,
            dims: {length,width,height},
            volumetricKg,
            actualKg,
            usedWeightKg: Math.max(volumetricKg, actualKg)
          });
          return {
            name: item.name,
            description: item.description || '',
            value: Number(item.price) || 10000,
            weight: nw,
            quantity: Number(item.quantity) || 1,
            length,
            width,
            height
          };
        });

        const itemsPayload = USE_MERGE ? buildMergedItem(invoice) : detailedItems;

        const totalGram = itemsPayload.reduce((s,i)=> s + i.weight * (i.quantity||1),0);
        console.log('[Biteship Debug] itemsPayload:', itemsPayload, 'totalGram:', totalGram, 'mode:', USE_MERGE?'MERGED':'DETAILED');

        // Fallback destination_area_id dari beberapa sumber jika field utama kosong
        const destinationAreaIdFallback = (
          invoice.destinationAreaId ||
          invoice?.shippingAddress?.area_id ||
          invoice?.shippingAddress?.area?.id ||
          invoice?.shippingAddress?.area?.area_id ||
          user?.area_id ||
          null
        );

        const payload = {
          origin_area_id: process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_AREA_ID,
          destination_area_id: destinationAreaIdFallback,
          couriers: selectedCourier,
          items: itemsPayload,
          origin_address: getOriginAddress(),
          destination_address: getDestinationAddress(),
        };

        if (isInstant && pickedCoord) {
          payload.destination_latitude = pickedCoord.lat;
          payload.destination_longitude = pickedCoord.lng;
          // Sertakan origin coord supaya API tidak tergantung env server
          if (Number.isFinite(ORIGIN_LAT) && Number.isFinite(ORIGIN_LNG)) {
            payload.origin_latitude = ORIGIN_LAT;
            payload.origin_longitude = ORIGIN_LNG;
          }
        }

        console.log('[Biteship Debug] rates payload:', payload);

        const res = await fetch('/api/biteship/biteship', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),
        });

        let data;
        if (!res.ok) {
          const errJson = await res.json().catch(()=>null);
          const msg = errJson?.message || '';
          // Fallback: bila kurir terpilih tidak tersedia, coba ambil semua kurir reguler
          if (/no courier available/i.test(msg)) {
            const fallbackPayload = { ...payload, couriers: 'jne,tiki,sicepat,jnt' };
            const res2 = await fetch('/api/biteship/biteship', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify(fallbackPayload)
            });
            if (res2.ok) {
              data = await res2.json();
              const first = (data.pricing || data.services || [])[0];
              if (first?.courier_code) setSelectedCourier(first.courier_code);
            } else {
              if (isInstant && res.status === 400) {
                setNeedInstantLocation(true);
                setInstantError('Lokasi tujuan belum valid. Pilih titik pada peta.');
              } else {
                setError(errJson?.message || 'Gagal ambil layanan kurir.');
              }
              return;
            }
          } else {
            if (isInstant && res.status === 400) {
              setNeedInstantLocation(true);
              setInstantError('Lokasi tujuan belum valid. Pilih titik pada peta.');
            } else {
              setError(msg || 'Gagal ambil layanan kurir.');
            }
            return;
          }
        } else {
          data = await res.json();
        }

        console.log('[Biteship Debug] rates response:', data);
        const all = (data.pricing || data.services || []);
        const available = all.filter(s => s.courier_code === selectedCourier);
        setServices(available);
        if (available.length) {
          setSelectedService(available[0].courier_service_code || available[0].service_code);
          setShippingCost(available[0].price);
        } else if (all.length) {
          const svc = all[0];
          setSelectedCourier(svc.courier_code);
          setServices(all.filter(s => s.courier_code === svc.courier_code));
          setSelectedService(svc.courier_service_code || svc.service_code);
          setShippingCost(svc.price);
        }
      } catch (err) {
        console.error('[Biteship Debug] rates error:', err);
        if (['grab','gojek'].includes(selectedCourier)) {
          setNeedInstantLocation(true);
          setInstantError('Terjadi kesalahan. Pilih titik lokasi tujuan.');
        } else {
          setError('Gagal ambil layanan kurir.');
        }
      }
    };

    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, selectedCourier, user, pickedCoord, autoUsingSavedInstant]);

  // Loader Google Maps ketika showMap true
  useEffect(()=>{
    if(!showMap) return;
    if (window.google && window.google.maps) {
      setMapReady(true);
      return;
    }
    const existing = document.querySelector('script[data-google-maps]');
    if (existing) {
      existing.onload = () => setMapReady(true);
      return;
    }
    const s=document.createElement('script');
    s.src=`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    s.async=true;
    s.defer=true;
    s.setAttribute('data-google-maps','1');
    s.onload=()=>setMapReady(true);
    s.onerror=()=>setInstantError('Gagal memuat Google Maps.');
    document.body.appendChild(s);
  },[showMap]);

  // Inisialisasi map
  useEffect(()=>{
    if(!showMap || !mapReady) return;
    if(!mapContainerRef.current) return;
    if(!window.google) return;
    if(!mapObjRef.current){
      mapObjRef.current=new window.google.maps.Map(mapContainerRef.current,{
        center:{lat: ORIGIN_LAT, lng: ORIGIN_LNG},
        zoom:12,
        mapTypeControl:false,
        streetViewControl:false,
        fullscreenControl:false
      });
      mapObjRef.current.addListener('click', (e)=>{
        const lat=e.latLng.lat();
        const lng=e.latLng.lng();
        const d=calcDistanceKm(ORIGIN_LAT,ORIGIN_LNG,lat,lng);
        if(d>INSTANT_RADIUS_KM){
          setInstantError(`Jarak ${d.toFixed(2)} km > ${INSTANT_RADIUS_KM} km (tidak tersedia).`);
          return;
        }
        setInstantError('');
        setPickedCoord({lat,lng});
        if(!markerRef.current){
          markerRef.current=new window.google.maps.Marker({
            position:{lat,lng},
            map:mapObjRef.current,
            draggable:true
          });
          markerRef.current.addListener('dragend',(ev)=>{
            const la=ev.latLng.lat();
            const ln=ev.latLng.lng();
              const dist=calcDistanceKm(ORIGIN_LAT,ORIGIN_LNG,la,ln);
              if(dist>INSTANT_RADIUS_KM){
                setInstantError(`Jarak ${dist.toFixed(2)} km > ${INSTANT_RADIUS_KM} km. Geser kembali.`);
                markerRef.current.setPosition(pickedCoord);
                return;
              }
              setInstantError('');
              setPickedCoord({lat:la,lng:ln});
          });
        } else {
          markerRef.current.setPosition({lat,lng});
        }
      });
    }
    if (window._prefillInstantCenter && isValidCoord(window._prefillInstantCenter.lat, window._prefillInstantCenter.lng)) {
      mapObjRef.current.setCenter({
        lat: window._prefillInstantCenter.lat,
        lng: window._prefillInstantCenter.lng
      });
    }
  },[showMap,mapReady]);

  // Handler validasi alamat & buka map
  const handleValidateAddress = async () => {
    setInstantError('');
    // Jika alamat kosong, tetap buka peta agar user bisa pilih titik manual
    if(!addressInput.trim()){
      window._prefillInstantCenter = null;
      setShowMap(true);
      return;
    }
    const coord = await getCoordinates(addressInput.trim());
    if(!coord){
      // Geocode gagal: buka peta dan minta user pilih titik manual
      setInstantError('Alamat tidak ditemukan. Silakan pilih titik manual di peta.');
      window._prefillInstantCenter = null;
      setShowMap(true);
      return;
    }
    const distance = calcDistanceKm(ORIGIN_LAT, ORIGIN_LNG, coord.lat, coord.lng);
    if(distance>INSTANT_RADIUS_KM){
      setInstantError(`Jarak ${distance.toFixed(2)} km > ${INSTANT_RADIUS_KM} km. Tidak tersedia layanan instant.`);
      // Tetap buka peta agar user bisa geser marker dalam radius
      window._prefillInstantCenter = { lat: ORIGIN_LAT, lng: ORIGIN_LNG };
      setShowMap(true);
      return;
    }
    // Geocode berhasil dan dalam radius: prefill center & marker
    window._prefillInstantCenter = coord;
    setPickedCoord(coord);
    setShowMap(true);
  };

  // Konfirmasi titik & refresh layanan
  const handleConfirmInstantPoint = async () => {
    setShowMap(false);
    if (pickedCoord && invoice?.buyerId) {
      try {
        await updateDoc(doc(firestore, 'users', invoice.buyerId), {
          instant_lat: pickedCoord.lat,
          instant_lng: pickedCoord.lng,
          instantUpdatedAt: serverTimestamp()
        });
        setUserInstantCoord(pickedCoord);
        setAutoUsingSavedInstant(true);
      } catch (e) {
        console.warn('Gagal simpan koordinat user', e);
      }
    }
    // fetchServices otomatis jalan via pickedCoord dependency
  };

  // Reset instant selection jika ganti kurir non-instant
  useEffect(()=>{
    if(!['grab','gojek','lalamove'].includes(selectedCourier)){
      setNeedInstantLocation(false);
      setShowMap(false);
      setInstantError('');
    }
  },[selectedCourier]);

  // Simpan catatan pembeli ke invoice
  const isGuestInvoice = !!(invoice?.guestUid || invoice?.buyerType === 'guest' || invoice?.cartId === 'guest' || !invoice?.buyerId);

  const handleNoteChange = async (e) => {
    setBuyerNote(e.target.value);
    // Avoid client write for guest (prevent Firestore permission errors)
    if (isGuestInvoice) return;
    try {
      await updateDoc(doc(firestore, 'invoices', String(invoiceId)), {
        buyerNote: e.target.value,
      });
    } catch (err) {
      // ignore error for non-critical note update
    }
  };

  // Ambil gambar produk dari Firestore berdasarkan productId
  useEffect(() => {
    if (!invoice || !invoice.items) return;
    const fetchImages = async () => {
      const imagesMap = {};
      await Promise.all(
        invoice.items.map(async (item) => {
          if (!item.productId) return;
          try {
            const prodRef = doc(firestore, 'products', String(item.productId));
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const prodData = prodSnap.data();
              let imgUrl = '/no-image.png'; // 2. Ganti fallback ke gambar lokal
              // Cari entry pertama non-empty di prodData.images
              if (Array.isArray(prodData.images) && prodData.images.length > 0) {
                const first = prodData.images.find(i => typeof i === 'string' && i.trim().length > 0);
                if (first) imgUrl = first;
                else if (prodData.image && typeof prodData.image === 'string' && prodData.image.trim().length > 0) imgUrl = prodData.image;
              } else if (typeof prodData.images === 'string' && prodData.images) {
                imgUrl = prodData.images;
              } else if (prodData.image && typeof prodData.image === 'string' && prodData.image.trim().length > 0) {
                imgUrl = prodData.image;
              }
              imagesMap[item.productId] = imgUrl;
            } else {
              imagesMap[item.productId] = '/no-image.png'; // 2. Ganti fallback ke gambar lokal
            }
          } catch {
            imagesMap[item.productId] = '/no-image.png'; // 2. Ganti fallback ke gambar lokal
          }
        })
      );
      setProductImages(imagesMap);
    };
    fetchImages();
  }, [invoice]);

  // ====== PATCH handleSaveShipping ======
  // Ganti fungsi handleSaveShipping lama dengan versi ini:
  const handleSaveShipping = async () => {
    if (!invoice) return;
  if (!selectedService && !shippingSelection) {
      alert('Pilih layanan pengiriman.');
      return;
    }

    let svc = selectedServiceObj;
    if (!svc && shippingSelection) {
      svc = {
        courier_code: shippingSelection.courier,
        courier_service_code: shippingSelection.service_code,
        courier_service_name: shippingSelection.service_name,
        price: shippingSelection.price,
        duration: shippingSelection.etd
      };
    }
    if (!svc) {
      alert('Layanan tidak ditemukan.');
      return;
    }
    if (['grab','gojek','lalamove'].includes(selectedCourier) && !pickedCoord && !shippingSelection?.destination_latitude) {
      alert('Pilih titik lokasi tujuan untuk kurir instant.');
      return;
    }

    const baseTotalCalc = basePreviewTotal;
    const finalGrand = baseTotalCalc + (paymentMethod === 'xendit' ? TRANSFER_FEE : 0);

    const shippingSelectionData = {
      courier: svc.courier_code || selectedCourier,
      service_code: svc.courier_service_code,
      service_name: svc.courier_service_name,
      etd: svc.duration || '',
      price: svc.price,
      ...(pickedCoord && ['grab','gojek','lalamove'].includes(selectedCourier)
        ? { destination_latitude: pickedCoord.lat, destination_longitude: pickedCoord.lng }
        : (shippingSelection?.destination_latitude ? {
            destination_latitude: shippingSelection.destination_latitude,
            destination_longitude: shippingSelection.destination_longitude
          } : {}))
    };

    // Status tetap draft, tidak trigger COD
    let newStatus = invoice.status;
    if (invoice.status === 'draft') {
      newStatus = 'draft';
    }

    try {
      // Jika guest, gunakan API route untuk update (karena permission)
      if (isGuestInvoice) {
        console.log('[handleSaveShipping] Guest mode, calling API with:', {
          invoiceId: String(invoiceId),
          guestUid: invoice.guestUid || null,
          shippingCost: svc.price,
          grandTotal: finalGrand,
        });
        
        const response = await fetch('/api/invoices/update-shipping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: String(invoiceId),
            guestUid: invoice.guestUid || null,
            shippingSelection: shippingSelectionData,
            shippingCost: svc.price,
            grandTotal: finalGrand,
            status: newStatus,
          }),
        });

        console.log('[handleSaveShipping] API response status:', response.status);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[handleSaveShipping] API error:', errorData);
          throw new Error(errorData.error || 'Failed to update shipping');
        }
        
        console.log('[handleSaveShipping] API success!');
      } else {
        // User terdaftar, update langsung via Firestore client
        await updateDoc(doc(firestore, 'invoices', String(invoiceId)), {
          shippingSelection: shippingSelectionData,
          shippingCost: svc.price,
          grandTotal: finalGrand,
          status: newStatus,
          updatedAt: serverTimestamp(),
          // Reset Xendit link if any, so buyer must recreate payment with new total
          'xendit.invoiceUrl': null,
        });
      }

      setInvoice(prev => ({
        ...prev,
        shippingSelection: shippingSelectionData,
        shippingCost: svc.price,
        grandTotal: finalGrand,
        status: newStatus,
      }));

      setShippingConfirmed(true); // PATCH: shipping sudah dikonfirmasi
  alert('Pengiriman tersimpan. Silakan konfirmasi dan lanjutkan pembayaran.');
  setEditingShipping(false);
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan pengiriman: ' + e.message);
    }
  };
  // ====== END PATCH handleSaveShipping ======

  // COD create order removed from buyer page

  // PASTIKAN sudah ada:
  // const [userInstantCoord, setUserInstantCoord] = useState(null);
  // const [autoUsingSavedInstant, setAutoUsingSavedInstant] = useState(false);
  // const [geocodingLoading, setGeocodingLoading] = useState(false);
  // const [needInstantLocation, setNeedInstantLocation] = useState(false);
  // const [pickedCoord, setPickedCoord] = useState(null);
  // const [instantError, setInstantError] = useState('');
  // const [showMap, setShowMap] = useState(false);

  // Tambahkan fungsi ini:
  const initInstantFromUserAddress = async () => {
    setInstantError('');
    setAutoUsingSavedInstant(false);

  if (!['grab','gojek','lalamove'].includes(selectedCourier)) return;

    if (!user?.address) {
      setInstantError('Alamat user belum tersedia.');
      return;
    }
    if (!isValidCoord(ORIGIN_LAT, ORIGIN_LNG)) {
      setInstantError('Koordinat origin tidak valid (cek env).');
      return;
    }

    // Jika user sudah punya koordinat tersimpan & masih dalam radius langsung pakai
    if (userInstantCoord && isValidCoord(userInstantCoord.lat, userInstantCoord.lng)) {
      const d = calcDistanceKm(ORIGIN_LAT, ORIGIN_LNG, userInstantCoord.lat, userInstantCoord.lng);
      if (d <= INSTANT_RADIUS_KM) {
        setPickedCoord(userInstantCoord);
        setNeedInstantLocation(false);
        setAutoUsingSavedInstant(true);
        return;
      }
    }

    // Geocode alamat user
    try {
      setGeocodingLoading(true);
      const coord = await getCoordinates(user.address);
      if (!coord || !isValidCoord(coord.lat, coord.lng)) {
        setInstantError('Gagal geocode alamat. Pilih titik manual.');
        setNeedInstantLocation(true);
        setShowMap(true);
        return;
      }
      const dist = calcDistanceKm(ORIGIN_LAT, ORIGIN_LNG, coord.lat, coord.lng);
      if (dist > INSTANT_RADIUS_KM) {
        setInstantError(`Jarak ${dist.toFixed(2)} km > ${INSTANT_RADIUS_KM} km. Kurir instant tidak tersedia.`);
        setNeedInstantLocation(false);
        setPickedCoord(null);
        return;
      }
      // Dalam radius: buka map untuk pilih titik presisi (atau langsung pakai coord jika mau)
      window._prefillInstantCenter = coord;
      setNeedInstantLocation(true);
      setShowMap(true);
    } finally {
      setGeocodingLoading(false);
    }
  };

  // Detect province from invoice & user
  useEffect(() => {
    if (!invoice) return;
    const { prov, source } = extractProvinceDynamic(invoice, user);
    setProvinceDetected(prov);
    setProvinceDebug(`ProvinceDetected="${prov}" via ${source}`);
  }, [invoice, user]);

  // COD eligibility logic removed

  // Hapus item pending dari cart setelah paid atau COD order dibuat (codOrderId) & status bukan draft
  useEffect(() => {
    // Hapus item pending dari cart setelah paid atau COD order dibuat (codOrderId) & status bukan draft
    if (!invoice || !invoice.cartId) return;
    const done = invoice.status === 'paid'
      || invoice.status === 'completed'
      || (invoice.paymentMethod === 'cod' && invoice.codOrderId);

    if (!done) return;

    const run = async () => {
      try {
        const cartRef = doc(firestore, 'carts', invoice.cartId);
        const snap = await getDoc(cartRef);
        if (!snap.exists()) return;
        const cartData = snap.data();
        const items = cartData.items || [];
        const filtered = items.filter(it => it.pendingInvoiceId !== invoice.invoiceId);
        if (filtered.length !== items.length) {
          await updateDoc(cartRef, { items: filtered });
        }
      } catch (e) {
        console.error('Gagal bersihkan cart setelah payment:', e);
      }
    };
    run();
  }, [invoice?.status, invoice?.codOrderId]);

  // Fetch voucher ketika invoice sudah ada (sekali saja)
  useEffect(() => {
    if (!invoice) return;
    let cancelled = false;
    const loadVouchers = async () => {
      try {
        setVoucherLoading(true);
        // Contoh: hanya voucher aktif
        const qRef = query(collection(firestore, 'vouchers'), where('active', '==', true));
        const snap = await getDocs(qRef);
        if (cancelled) return;
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVoucherList(list);
      } catch (e) {
        console.warn('Fetch vouchers gagal:', e);
      } finally {
        if (!cancelled) setVoucherLoading(false);
      }
    };
    loadVouchers();
    return () => { cancelled = true; };
  }, [invoice]);

  // Ganti fungsi handleApplyVoucher lama dengan versi ini:
  const handleApplyVoucher = async () => {
    if (voucherLoading) return;
    setVoucherError('');
    setVoucherApplied(false);
    setVoucherDiscount(0);
    setVoucherObj(null);

    const code = voucherCode.trim();
    if (!code) return;

    if (!voucherList.length) {
      setVoucherError('Voucher belum termuat.');
      return;
    }

    const v = voucherList.find(
      x => (x.code || '').trim().toUpperCase() === code.toUpperCase()
    );
    if (!v) { setVoucherError('Kode voucher tidak valid.'); return; }
    if (!v.active) { setVoucherError('Voucher nonaktif.'); return; }

    const now = new Date();
    const start = v.startDate?.seconds
      ? new Date(v.startDate.seconds * 1000)
      : (v.startDate ? new Date(v.startDate) : null);
    const end = v.endDate?.seconds
      ? new Date(v.endDate.seconds * 1000)
      : (v.endDate ? new Date(v.endDate) : (v.expiresAt?.seconds ? new Date(v.expiresAt.seconds*1000) : null));

    if ((start && now < start) || (end && now > end)) {
      setVoucherError('Voucher di luar periode.');
      return;
    }

    // Hitung subtotal produk
    const subtotal = invoice?.subtotal ??
      (invoice?.items || []).reduce(
        (s,it)=> s + (Number(it.price)||0) * (Number(it.quantity)||1), 0
      );

    let discount = 0;
    if (v.type === 'percentage' || v.percent) {
      const pct = Number(v.percent ?? v.value ?? 0);
      discount = Math.floor(subtotal * (pct / 100));
      const maxDisc = v.maxDiscount ?? v.max_discount;
      if (maxDisc && discount > Number(maxDisc)) discount = Number(maxDisc);
    } else if (['fixed','nominal'].includes(v.type)) {
      discount = Number(v.value ?? v.amount ?? 0) || 0;
    } else if (typeof v.amount === 'number') {
      discount = v.amount;
    }

    if (discount > subtotal) discount = subtotal;
    if (discount <= 0) {
      setVoucherError('Diskon tidak berlaku.');
      return;
    }

    // Tambahkan validasi untuk refund voucher
    if (v.sourceInvoiceId) {
      const max = v.max_uses || v.maxUses || 1;
      const used = v.used || 0;
      // Jika sudah dipakai
      if (used >= max) {
        setVoucherError('Voucher refund sudah terpakai.');
        return;
      }
      // Jika pernah dipakai oleh user ini
      if (Array.isArray(v.usedBy) && v.usedBy.includes(user?.uid)) {
        setVoucherError('Voucher refund sudah Anda gunakan.');
        return;
      }
    }

    // State UI
    setVoucherDiscount(discount);
    setVoucherApplied(true);
    setVoucherObj(v);

    // Recalculate total segera & simpan ke Firestore (tanpa menunggu aksi lain)
    try {
      const shippingUsed = invoice?.shippingSelection?.price
        || invoice?.shippingCost
        || 0;

      const baseAfterVoucher = Math.max(subtotal - discount, 0);
      const codEligibleNow = (paymentMethod === 'cod') && effectiveCodEligible;
      const codFeeNow = codEligibleNow
        ? Math.ceil((baseAfterVoucher + shippingUsed) * COD_FEE_RATE)
        : 0;
  const transferFeeNow = (paymentMethod === 'xendit') ? TRANSFER_FEE : 0;

      const newGrand = baseAfterVoucher + shippingUsed + codFeeNow + transferFeeNow;

      if (!isGuestInvoice) {
        await updateDoc(doc(firestore, 'invoices', String(invoiceId)), {
          voucherCode: v.code || v.id,
          voucherDiscount: discount,
          grandTotal: newGrand,
          codFee: codFeeNow || null,
          transferFee: transferFeeNow || null,
          updatedAt: serverTimestamp()
        });
      }

      // Sinkronkan invoice state lokal
      setInvoice(prev => prev ? {
        ...prev,
        voucherCode: v.code || v.id,
        voucherDiscount: discount,
        grandTotal: newGrand,
        codFee: codFeeNow || prev.codFee,
        transferFee: transferFeeNow || prev.transferFee
      } : prev);
    } catch (e) {
      console.warn('Gagal simpan voucher ke invoice (tetap pakai lokal):', e);
    }
  };

  // ===== Voucher Claim Helpers =====
  function isVoucherActiveNow(v) {
    const now = new Date();
    const start = v.startDate?.seconds
      ? new Date(v.startDate.seconds * 1000)
      : (v.startDate ? new Date(v.startDate) : null);
    const end = v.endDate?.seconds
      ? new Date(v.endDate.seconds * 1000)
      : (v.endDate ? new Date(v.endDate) : (v.expiresAt?.seconds ? new Date(v.expiresAt.seconds*1000) : null));
    if (start && now < start) return false;
    if (end && now > end) return false;
    return !!v.active;
  }

  function splitVouchersForUser(list, uid) {
    const general = [];
    const special = [];
    for (const v of list) {
      if (!isVoucherActiveNow(v)) continue;
      const kind = v.voucherKind || (v.sourceInvoiceId ? 'refund' : 'general');
      if (kind === 'general') {
        // Capacity check (if set)
        const total = Number(v.totalQty ?? 0);
        const claimed = Number(v.claimedCount ?? 0);
        if (total > 0 && claimed >= total) continue;
        general.push(v);
      } else {
        const allowed = (v.allowedBuyerId ? String(v.allowedBuyerId) === String(uid) : false);
        if (!allowed) continue;
        const used = Number(v.used ?? 0);
        const maxUses = Number(v.max_uses ?? v.maxUses ?? 1);
        if (used >= maxUses) continue;
        if (Array.isArray(v.usedBy) && v.usedBy.includes(uid)) continue;
        special.push(v);
      }
    }
    return { general, special };
  }

  // Open claim modal: prefetch claimed codes by user
  const openClaimModal = async () => {
    setClaimError('');
    setClaimModalOpen(true);
    if (!user?.uid) return;
    try {
      setClaimLoading(true);
      const qRef = query(collection(firestore, 'voucher_claims'), where('buyerId', '==', user.uid));
      const snap = await getDocs(qRef);
      const map = {};
      snap.forEach(d => { const c = (d.data().code || '').trim().toUpperCase(); if (c) map[c] = true; });
      setClaimedCodesMap(map);
    } catch (e) {
      setClaimError(e.message || 'Gagal memuat klaim.');
    } finally {
      setClaimLoading(false);
    }
  };

  const claimGeneralVoucher = async (voucher) => {
    if (!user?.uid) { alert('Harus login.'); return; }
    const code = (voucher.code || '').trim().toUpperCase();
    if (!code) return;
    setClaimError('');
    try {
      setClaimLoading(true);
      const claimId = `${user.uid}_${code}`;
      const claimRef = doc(firestore, 'voucher_claims', claimId);
      const voucherRef = doc(firestore, 'vouchers', voucher.id || code);
      await runTransaction(firestore, async (tx) => {
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists()) {
          throw new Error('Anda sudah mengklaim voucher ini.');
        }
        const vSnap = await tx.get(voucherRef);
        if (!vSnap.exists()) throw new Error('Voucher tidak ditemukan.');
        const v = vSnap.data();
        if (!isVoucherActiveNow(v)) throw new Error('Voucher tidak aktif.');
        const total = Number(v.totalQty ?? 0);
        const claimed = Number(v.claimedCount ?? 0);
        if (total > 0 && claimed >= total) throw new Error('Kuota habis.');
        tx.set(claimRef, {
          id: claimId,
          code,
          buyerId: user.uid,
          createdAt: serverTimestamp()
        });
        tx.update(voucherRef, { claimedCount: increment(1) });
      });
      setClaimedCodesMap(prev => ({ ...prev, [code]: true }));
      setVoucherCode(code);
      alert('Voucher berhasil diklaim. Kode telah diisi.');
    } catch (e) {
      alert(e.message || 'Gagal klaim voucher.');
    } finally {
      setClaimLoading(false);
    }
  };

  const useVoucherCode = (voucher) => {
    const code = (voucher.code || '').trim();
    setVoucherCode(code);
    setClaimModalOpen(false);
  };

  // Copy voucher code for manual paste by the user
  const copyVoucherCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      alert('Kode voucher disalin. Tempelkan di kolom voucher secara manual.');
    } catch (e) {
      // Fallback: tampilkan prompt untuk copy manual
      window.prompt('Salin kode voucher berikut:', code);
    }
  };

  // === Create Xendit Invoice ===
  const handleCreateMidtransPayment = async () => {
    if (!invoice) return;
    if (!shippingConfirmed && !invoice.shippingSelection) {
      alert('Simpan / konfirmasi pengiriman dulu.');
      return;
    }
    if (xenditLoading) return;
    setXenditError('');
    setXenditLoading(true);
    // Hitung total terbaru secara deterministik (tanpa fee COD untuk Xendit)
    const productSubtotal = (invoice.items || []).reduce(
      (s,i)=> s + (Number(i.price)||0) * (Number(i.quantity)||1), 0
    );
    const shippingUsed = invoice.shippingSelection?.price || invoice.shippingCost || 0;
    let discountToApply = (voucherApplied && voucherDiscount > 0) ? voucherDiscount : Number(invoice.voucherDiscount || 0);
    if (discountToApply > productSubtotal) discountToApply = productSubtotal;
  const isTransfer = true; // transfer via Midtrans Snap
  const amountNow = Math.max(productSubtotal - discountToApply,0) + shippingUsed + (isTransfer ? TRANSFER_FEE : 0);

    // Jika sudah ada link dan totalnya cocok, langsung pakai link tersebut
    // Midtrans: always create new token to ensure latest total

    // Midtrans Snap opens a popup overlay; stay on this page
    // Sinkronkan nilai terkini ke invoice sebelum membuat pembayaran
    try {
      if (!isGuestInvoice) {
        await updateDoc(doc(firestore,'invoices',String(invoiceId)),{
          voucherDiscount: discountToApply,
          grandTotal: amountNow,
          paymentMethod: 'midtrans',
          status: invoice.status === 'draft' ? 'waiting' : invoice.status,
          updatedAt: serverTimestamp(),
          transferFee: TRANSFER_FEE,
        });
      }
      setInvoice(prev=> prev ? {
        ...prev,
        voucherDiscount: discountToApply,
        grandTotal: amountNow,
        paymentMethod: 'midtrans',
        status: prev.status === 'draft' ? 'waiting' : prev.status,
        midtrans: { ...(prev.midtrans||{}), token: null }
      } : prev);
    } catch (e) {
      console.warn('Sinkronisasi invoice gagal (lanjut membuat pembayaran):', e);
    }

    try {
      const resp = await fetch('/api/midtrans/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.invoiceId || invoiceId })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Gagal membuat transaksi Midtrans');

      const token = data.token;
      if (!token) throw new Error('Token Snap tidak tersedia');
      if (!window.snap) {
        setXenditError('Snap belum siap. Muat ulang halaman dan coba lagi.');
        return;
      }

      window.snap.pay(token, {
        onSuccess: function(result){
          console.log('Midtrans success', result);
          // Hit backend to verify and persist status, then redirect
          fetch('/api/midtrans/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: String(invoice.invoiceId || invoiceId) })
          }).catch(()=>{}).finally(()=>{
            alert('Pembayaran berhasil.');
            router.replace('/account');
          });
        },
        onPending: function(result){
          console.log('Midtrans pending', result);
          alert('Menunggu pembayaran.');
          // Tetap di halaman; buyer bisa menutup popup dan menyelesaikan nanti
        },
        onError: function(result){
          console.error('Midtrans error', result);
          setXenditError('Pembayaran gagal. Coba lagi atau pilih metode lain.');
        },
        onClose: function(){
          console.log('Midtrans popup closed');
        }
      });
    } catch (e) {
      console.error('Create Midtrans error:', e);
      setXenditError(e.message || String(e));
    } finally {
      setXenditLoading(false);
    }
  };
  // --- END Create Xendit Invoice ---

  // === TOTAL CALCULATION (single source of truth) ===
  const rawSubtotal = 
    invoice?.subtotal ??
    (invoice?.items?.reduce(
      (s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
      0
    ) || 0);

  const effectiveVoucherDiscount = voucherApplied
    ? voucherDiscount
    : (invoice?.voucherDiscount ??
       invoice?.voucher?.discountApplied ??
       0);

  const baseAmount = Math.max(rawSubtotal - effectiveVoucherDiscount, 0);
  const shippingCostForCalc =
    (invoice?.shippingSelection?.price ??
     invoice?.shippingCost ??
     shippingCost ??
     0);

  const isTransfer = true; // Transfer (Midtrans)
  const calculatedTransferFee = TRANSFER_FEE;

  const totalInvoice = baseAmount + shippingCostForCalc + calculatedTransferFee;
  const subtotalForCalc = rawSubtotal;
  const appliedVoucherDiscount = effectiveVoucherDiscount;
  // === END TOTAL CALCULATION ===

  // Tampilkan loading sampai auth dan data siap
  if (!authReady || loading) return <div className="text-center py-10">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;
  if (!invoice) return null;

  // Destructure invoice tanpa tabrakan dengan state voucherDiscount
  const {
    items = [],
    subtotal: invSubtotal = 0,
    voucherDiscount: invVoucherDiscount = 0,
    shippingSelection,
    shippingCost: sc = 0,
    grandTotal
  } = invoice;

  // Service terpilih (preview) untuk estimasi sebelum disimpan
  const selectedServiceObj = services.find(
    s => (s.courier_service_code || s.service_code) === selectedService
  );

  // Harga ongkir preview (pakai pilihan user bila belum disimpan)
  const previewShippingCost = shippingSelection
    ? shippingSelection.price
    : (selectedServiceObj ? selectedServiceObj.price : 0);

  // Subtotal invoice efektif
  const effectiveInvoiceSubtotal = invSubtotal || rawSubtotal;

  // Diskon voucher efektif (pakai yang user apply di halaman ini jika ada)
  const effectiveInvoiceVoucherDiscount = voucherApplied
    ? voucherDiscount
    : invVoucherDiscount;

  // Base (produk - voucher) untuk preview
  const basePreviewSubtotalAfterVoucher = Math.max(
    effectiveInvoiceSubtotal - effectiveInvoiceVoucherDiscount,
    0
  );

  // Total dasar preview (belum COD fee) = base after voucher + preview shipping
  const basePreviewTotal = basePreviewSubtotalAfterVoucher + previewShippingCost;

  // Eligibility COD: gunakan variabel effectiveCodEligible yang sudah dideklarasikan di atas (jangan redeclare)

  // Preview COD fee (5%) jika user pilih COD
  const previewTransferFee = TRANSFER_FEE;

  // Grand total preview untuk tampilan tombol (tidak menimpa totalInvoice final yg sudah dihitung di blok “TOTAL CALCULATION”)
  const displayGrand = basePreviewTotal + previewTransferFee;

  // HITUNG TOTAL DI LUAR BLOK SEMENTARA agar variabel tersedia untuk JSX
  // const subtotalForCalc = invoice?.subtotal ?? (invoice?.items?.reduce((s,i)=> s + (Number(i.price)||0) * (i.quantity||1), 0) || 0);
  // const voucherDiscountForCalc = invoice?.voucherDiscount ?? (invoice?.voucher?.discountApplied ?? 0);

  // // baseAmount = jika grandTotal sudah ditetapkan di invoice pakai itu,
  // // kalau tidak gunakan subtotal - voucherDiscount
  // const baseAmount = (invoice?.grandTotal != null) ? invoice.grandTotal : Math.max(subtotalForCalc - voucherDiscountForCalc, 0);

  // const shippingCostForCalc = invoice?.shippingCost ?? sc ?? 0;

  // const isCOD = paymentMethod === 'cod' && effectiveCodEligible;
  // const calculatedCodFee = isCOD ? Math.ceil((baseAmount + shippingCostForCalc) * COD_FEE_RATE) : 0;

  // const totalInvoice = baseAmount + shippingCostForCalc + calculatedCodFee;

  // Tambah totalWeight untuk tampilan
  const totalWeight = (invoice?.items || []).reduce(
    (s,i)=> s + ((Number(i.weight)||0) * (Number(i.quantity)||1)), 0
  );

  // Fungsi redirect ke thankyou page setelah submit
  const redirectToThankYou = () => {
    router.push('/product/payment/thankyou');
  };

  // handleAjukanCOD removed
  // ...existing code (return JSX below)...
  return (
    <>
      <main className="max-w-md mx-auto px-2 py-6">
        {/* Back Button & Title */}
        <div className="flex items-center mb-4">
          <button
            className="mr-2 p-2 rounded hover:bg-gray-100"
            onClick={() => router.back()}
            aria-label="Kembali"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className="text-lg font-semibold">Pembayaran</h1>
        </div>
        {/* Buyer Info */}
        <section className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{user?.name || invoice.buyerName} {user?.phone || invoice.buyerPhone ? `( ${user?.phone || invoice.buyerPhone} )` : ''}</span>
            <span>{user?.address || invoice?.buyerAddress || invoice?.destinationAddress || invoice?.shippingAddress?.address || ''}</span>
          </div>
        </section>
        {/* Store & Items */}
        <section className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="font-semibold mb-1 text-sm">{invoice.storeName || 'Toko'}</div>
          <div className="space-y-1 mb-2">
            {items
              .filter(item => item.name !== 'Proteksi Kerusakan' && item.name !== 'Voucher Toko')
              .map(item => (
                <div key={item.productId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {/* 3. Ganti <img> dengan <Image> */}
                    <Image
                      src={productImages[item.productId] || '/no-image.png'}
                      alt={item.name}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-cover rounded bg-gray-100"
                      onError={e => { e.currentTarget.src = '/no-image.png'; }}
                    />
                    <div className="flex flex-col">
                      <span>{item.name} x{item.quantity}</span>
                      {((item.variantSize != null && item.variantSize !== '') || item.variantLabel || item.variant) && (
                        <p className="text-xs text-gray-500">
                          {item.variantSize != null && item.variantSize !== '' ? (
                            <>Ukuran: {String(item.variantSize)} cm</>
                          ) : (
                            <>Varian: {item.variantLabel || item.variant}</>
                          )}
                        </p>
                      )}
                      <span className="text-[10px] text-gray-500">
                        {(Number(item.weight)||0)} g / item • {(Number(item.weight)||0)*(Number(item.quantity)||1)} g total
                      </span>
                    </div>
                  </div>
                  <span className="font-semibold text-orange-700">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                </div>
              ))}
          </div>
          <div className="flex justify-between text-[11px] pt-2 border-t">
            <span>Total Berat</span>
            <span>{totalWeight} g</span>
          </div>
        </section>
        {/* Buyer Note */}
        <section className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="font-semibold mb-2 text-sm">Catatan untuk Penjual</div>
          <textarea
            className="border rounded px-2 py-1 w-full text-xs"
            rows={2}
            placeholder="Tulis catatan (opsional)..."
            value={buyerNote}
            onChange={handleNoteChange}
            disabled={processingPayment}
          />
        </section>
        {/* Shipping Option */}
        <section className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">Opsi Pengiriman</div>
            {!!shippingSelection && invoice.status !== 'paid' && invoice.status !== 'completed' && (
              !editingShipping ? (
                <button
                  type="button"
                  className="text-[11px] text-primary underline"
                  onClick={()=>{
                    setEditingShipping(true);
                    setNeedInstantLocation(false);
                    setInstantError('');
                  }}
                >Ubah Pengiriman</button>
              ) : (
                <button
                  type="button"
                  className="text-[11px] text-gray-600 underline"
                  onClick={()=> setEditingShipping(false)}
                >Batal</button>
              )
            )}
          </div>
          {!shippingSelection || editingShipping ? (
            <>
              <div className="mb-2">
                <select
                  className="border rounded px-2 py-1 w-full text-xs"
                  value={selectedCourier}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedCourier(val);
                    setServices([]);
                    setSelectedService('');
                    setPickedCoord(null);
                    setAutoUsingSavedInstant(false);
                    if (['grab','gojek','lalamove'].includes(val)) {
                      initInstantFromUserAddress();
                    } else {
                      setNeedInstantLocation(false);
                      setInstantError('');
                    }
                  }}
                  disabled={processingPayment}
                >
                  {COURIERS.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              {needInstantLocation && ['grab','gojek','lalamove'].includes(selectedCourier) && (
                <div className="border rounded p-2 mb-2 bg-orange-50">
                  <p className="text-[11px] mb-1 font-semibold text-orange-700">Lokasi tujuan diperlukan untuk kurir instant.</p>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 w-full text-xs mb-2"
                    placeholder="Masukkan alamat tujuan"
                    value={addressInput}
                    onChange={e=>setAddressInput(e.target.value)}
                  />
                  <button
                    className="bg-orange-600 text-white px-2 py-1 rounded text-xs font-semibold w-full"
                    onClick={handleValidateAddress}
                    type="button"
                  >
                    Validasi & Pilih Titik
                  </button>
                  {instantError && <p className="text-[10px] text-red-600 mt-1">{instantError}</p>}
                </div>
              )}

              {!needInstantLocation && services.length > 0 && (
                <div className="mb-2">
                  <select
                    className="border rounded px-2 py-1 w-full text-xs"
                    value={selectedService}
                    onChange={e => setSelectedService(e.target.value)}
                    disabled={processingPayment || !services.length}
                  >
                    {services.map(svc => {
                      const code = svc.courier_service_code || svc.service_code;
                      const name = svc.courier_service_name || svc.service_name;
                      const dur = svc.duration || svc.etd || '';
                      return (
                        <option key={code} value={code}>
                          {name} {dur && `(${dur})`} - Rp {svc.price.toLocaleString('id-ID')}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <button
                className="bg-blue-600 text-white px-2 py-1 rounded w-full text-xs font-semibold disabled:opacity-50"
                onClick={handleSaveShipping}
                disabled={processingPayment || !selectedService || (['grab','gojek','lalamove'].includes(selectedCourier) && !pickedCoord)}
              >
                Simpan Pengiriman
              </button>
              {instantError && !needInstantLocation && <p className="text-[10px] text-red-600 mt-1">{instantError}</p>}
            </>
          ) : (
            <div className="flex justify-between items-center text-xs">
              <span>{shippingSelection?.courier?.toUpperCase?.() || '-'} - {shippingSelection?.service_name || '-'}</span>
              <span className="font-semibold">Rp {shippingSelection.price.toLocaleString('id-ID')}</span>
            </div>
          )}
          {shippingSelection && (
            <div className="text-[10px] text-green-600 mt-1">
              Garansi tiba: {shippingSelection.etd} hari
            </div>
          )}
          {autoUsingSavedInstant && ['grab','gojek','lalamove'].includes(selectedCourier) && (
            <div className="mb-2">
              <button
                type="button"
                className="border px-2 py-1 rounded text-[11px]"
                onClick={()=>{
                  setShowMap(true);
                  setNeedInstantLocation(true);
                  setAutoUsingSavedInstant(false);
                  setInstantError('');
                }}
              >
                Ubah Lokasi Instant
              </button>
            </div>
          )}
          {autoUsingSavedInstant && pickedCoord && (
            <p className="text-[10px] text-green-600 mb-2">
              Menggunakan lokasi tersimpan: {pickedCoord.lat.toFixed(4)}, {pickedCoord.lng.toFixed(4)}
            </p>
          )}
          {geocodingLoading && (
            <p className="text-[10px] text-blue-600 mb-1">Memeriksa alamat & radius...</p>
          )}
        </section>
        {/* Metode Pembayaran */}
        <section className="bg-white rounded-lg shadow p-4 mb-3">
          <h3 className="text-sm font-semibold mb-2">Metode Pembayaran</h3>
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex flex-col gap-1 p-2 border rounded cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="paymethod"
                  value="midtrans"
                  checked={paymentMethod==='midtrans'}
                  onChange={()=> setPaymentMethod('midtrans')}
                />
                <span>Transfer / VA / E-Wallet (Midtrans)</span>
              </span>
              <span className="text-[10px] text-gray-500">
                Bayar via Midtrans Snap (VA / QRIS / e-Wallet). Simpan pengiriman dahulu.
              </span>
            </label>
          </div>
        </section>
        {/* Xendit does not expose VA details client-side here */}
        {/* Total & Payment */}
        <section className="bg-white rounded-lg shadow p-4 mb-4">
          {/* Input voucher */}
          <div className="flex mb-2">
            <button
              type="button"
              className="mr-2 border border-red-300 text-red-700 px-3 rounded text-sm hover:bg-red-50"
              onClick={openClaimModal}
            >
              Klaim Voucher
            </button>
          </div>
          <div className="flex mb-2">
            <input
              type="text"
              placeholder={voucherLoading ? 'Memuat voucher...' : 'Masukkan kode voucher'}
              value={voucherCode}
              onChange={e => {
                setVoucherCode(e.target.value);
                setVoucherApplied(false);
                setVoucherError('');
                setVoucherDiscount(0);
              }}
              disabled={voucherLoading}
              className="flex-1 border rounded-l px-2 py-1 text-sm"
            />
            <button
              className={`bg-red-600 text-white px-3 rounded-r text-sm${(voucherCode.trim() === '' || voucherLoading) ? ' opacity-50 cursor-not-allowed' : ''}`}
              disabled={voucherCode.trim() === '' || voucherLoading}
              onClick={handleApplyVoucher}
              type="button"
            >
              Gunakan
            </button>
          </div>
          {voucherError && <p className="text-xs text-red-500">{voucherError}</p>}
          {voucherApplied && voucherDiscount > 0 && (
            <p className="text-xs text-green-600">
              Diskon voucher: Rp {voucherDiscount.toLocaleString('id-ID')}
            </p>
          )}

          {/* Total & Payment */}
          <div className="flex justify-between text-xs mb-1">
            <span>Total {items.length} Produk</span>
            <span>Rp {(subtotalForCalc).toLocaleString('id-ID')}</span>
          </div>
          {appliedVoucherDiscount > 0 && (
            <div className="flex justify-between text-xs text-green-600 mb-1">
              <span>Voucher</span>
              <span>- Rp {appliedVoucherDiscount.toLocaleString('id-ID')}</span>
            </div>
          )}
          {isTransfer && (
            <div className="flex justify-between text-xs mb-1">
              <span>Biaya Pembayaran</span>
              <span>Rp {TRANSFER_FEE.toLocaleString('id-ID')}</span>
            </div>
          )}
          <div className="flex justify-between text-xs mb-3">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-orange-600">
              Rp {(subtotalForCalc - appliedVoucherDiscount + shippingCostForCalc + (isTransfer ? TRANSFER_FEE : 0)).toLocaleString('id-ID')}
            </span>
          </div>
          <div className="space-y-2">
            <button
              className="bg-red-600 text-white px-2 py-2 rounded w-full text-sm font-bold disabled:opacity-50"
              disabled={xenditLoading || !shippingSelection || editingShipping || paymentMethod!=='midtrans'}
              onClick={handleCreateMidtransPayment}
            >
              {xenditLoading ? 'Memproses...' : 'Bayar via Midtrans'}
            </button>
            {xenditError && (
              <p className="text-[10px] text-red-600">{xenditError}</p>
            )}
          </div>
        </section>
  </main>

      {/* Midtrans Snap script */}
      <Script
        id="midtrans-snap"
        src={(String(process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION||process.env.MIDTRANS_IS_PRODUCTION)==='true')
          ? 'https://app.midtrans.com/snap/snap.js'
          : 'https://app.sandbox.midtrans.com/snap/snap.js'}
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY_SANDBOX}
        strategy="afterInteractive"
      />

      {/* Modal Map */}
      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-md rounded shadow-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Pilih Titik Lokasi Tujuan</h3>
            <div ref={el=>{mapContainerRef.current=el}} className="w-full h-64 rounded border" />
            <p className="text-[11px] text-gray-500 mt-2">
              Klik pada peta (radius {INSTANT_RADIUS_KM} km dari origin). Geser marker untuk koreksi.
            </p>
            {pickedCoord && (
              <p className="text-[11px] mt-1">
                Dipilih: {pickedCoord.lat.toFixed(5)}, {pickedCoord.lng.toFixed(5)}
              </p>
            )}
            {instantError && <p className="text-[11px] text-red-600 mt-1">{instantError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                className="flex-1 border rounded px-3 py-1 text-xs"
                onClick={()=>{setShowMap(false); /* keep pickedCoord for reuse */}}
              >Tutup</button>
              <button
                className="flex-1 bg-green-600 text-white rounded px-3 py-1 text-xs disabled:opacity-50"
                disabled={!pickedCoord || !!instantError}
                onClick={handleConfirmInstantPoint}
              >Konfirmasi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Klaim Voucher */}
      {claimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setClaimModalOpen(false)} />
          <div className="relative z-50 w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold mb-2">Klaim Voucher</h3>
            {claimError && <div className="text-[11px] text-red-600 mb-2">{claimError}</div>}
            <div className="space-y-3 max-h-[65vh] overflow-auto pr-1">
              {(() => {
                const { general, special } = splitVouchersForUser(voucherList, user?.uid);
                return (
                  <>
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1">Voucher Umum</div>
                      {general.length === 0 ? (
                        <div className="text-[11px] text-gray-500">Tidak ada voucher umum tersedia.</div>
                      ) : (
                        <div className="space-y-2">
                          {general.map(v => {
                            const code = (v.code||'').toUpperCase();
                            const total = Number(v.totalQty ?? 0);
                            const claimed = Number(v.claimedCount ?? 0);
                            const remaining = total > 0 ? Math.max(total - claimed, 0) : null;
                            const claimedByUser = !!claimedCodesMap[code];
                            const isPct = v.type === 'percentage';
                            const vv = isPct ? `${v.value||0}%` : `Rp ${(Number(v.value||v.amount||0)).toLocaleString('id-ID')}`;
                            return (
                              <div key={v.id||code} className="border rounded p-2 text-xs flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold font-mono tracking-wide text-primary cursor-pointer" title="Klik untuk menyalin" onClick={()=>copyVoucherCode(code)}>{code}</div>
                                  <div className="text-[11px] text-gray-600">{isPct ? 'Diskon' : 'Potongan'}: {vv}</div>
                                  {remaining !== null && (
                                    <div className="text-[11px] text-gray-500">Sisa: {remaining} / {total}</div>
                                  )}
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-[11px] rounded border text-primary border-red-300 hover:bg-red-50 disabled:opacity-50"
                                    onClick={() => copyVoucherCode(code)}
                                  >Salin Kode</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1 mt-2">Voucher Khusus Anda</div>
                      {special.length === 0 ? (
                        <div className="text-[11px] text-gray-500">Tidak ada voucher khusus.</div>
                      ) : (
                        <div className="space-y-2">
                          {special.map(v => {
                            const code = (v.code||'').toUpperCase();
                            const isPct = v.type === 'percentage';
                            const vv = isPct ? `${v.value||0}%` : `Rp ${(Number(v.value||v.amount||0)).toLocaleString('id-ID')}`;
                            return (
                              <div key={v.id||code} className="border rounded p-2 text-xs flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold font-mono tracking-wide text-primary cursor-pointer" title="Klik untuk menyalin" onClick={()=>copyVoucherCode(code)}>{code}</div>
                                  <div className="text-[11px] text-gray-600">{isPct ? 'Diskon' : 'Potongan'}: {vv}</div>
                                  {v.sourceInvoiceId && (
                                    <div className="text-[10px] text-amber-700">Voucher Refund</div>
                                  )}
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-[11px] rounded border text-primary border-red-300 hover:bg-red-50"
                                    onClick={() => copyVoucherCode(code)}
                                  >Salin Kode</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-3">
              <button type="button" className="w-full px-3 py-2 text-xs border rounded hover:bg-gray-50" onClick={()=>setClaimModalOpen(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

// Tambah helper province (letakkan setelah konstanta / sebelum component return)
function extractProvince(invoice, user) {
  return (invoice?.shippingAddress?.province ||
          user?.province ||
          user?.address_province ||
          '').trim();
}

// Ganti / tambahkan fungsi extractProvince agar gunakan invoice & user & parsing:
function extractProvinceDynamic(inv, usr) {
  // Prioritas field terstruktur
  const structured = inv?.shippingAddress?.province
    || inv?.shippingAddress?.province_name
    || usr?.province
    || usr?.address_province
    || '';
  let prov = structured ? normalizeProvinceName(structured.trim()) : '';
  let source = 'structured';

  if (!prov) {
    // Coba field area di shippingAddress
    const areaProv = inv?.shippingAddress?.area?.province;
    if (areaProv) {
      prov = normalizeProvinceName(areaProv);
      source = 'shippingAddress.area.province';
    }
  }

  if (!prov) {
    // Parse dari address string
    const addr = inv?.shippingAddress?.address || usr?.address || '';
    const parsed = detectProvinceFromAddress(addr);
    if (parsed) {
      prov = parsed;
      source = 'parsed-address';
    }
  }

  return { prov, source };
}

// === PATCH finalizePaymentSuccess (tambahkan fungsi ini di luar komponen) ===
async function finalizePaymentSuccess(newStatus = 'paid') {
  // ...existing logic update invoice ke paid...
  try {
    if (invoice?.voucherCode) {
      await markRefundVoucherUsedOnce(invoice.voucherCode, user?.uid);
    }
  } catch (e) {
    console.warn('Gagal lock voucher refund:', e.message);
  }
}
// Panggil finalizePaymentSuccess() di tempat Anda sebelumnya langsung mengubah status menjadi paid.