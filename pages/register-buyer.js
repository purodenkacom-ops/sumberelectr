import { useState } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore, createUserWithEmailAndPassword, doc, setDoc } from '@/utils/firebase';
import { EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import AreaSelect from '../components/AreaSelect';
import Link from 'next/link';
import { sendEmailVerification } from 'firebase/auth';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    street: '',
    phone: '',
    area: null,
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAreaSelect = (area) => {
    setForm({ ...form, area });
  };

  // Helper untuk bikin address dari street + area
  const makeAddress = (street, area) => {
    if (!area) return street;
    const { id, ...areaNoId } = area;
    const addressParts = [
      street,
      areaNoId.name,
      areaNoId.city_name,
      areaNoId.district,
      areaNoId.province,
      areaNoId.postal_code
    ].filter(Boolean);
    return addressParts.join(', ');
  };

  // Buat area tanpa id
  const areaWithoutId = (area) => {
    if (!area) return null;
    const { id, ...rest } = area;
    return rest;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validasi form
    if (!form.name || !form.street || !form.phone || !form.area ||
        !form.email || !form.password || !form.confirmPassword) {
      setError('Mohon lengkapi semua data.');
      setLoading(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Kata sandi tidak sama.');
      setLoading(false);
      return;
    }

    try {
      let user;
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        // Upgrade anonymous account to permanent with email/password (keeps UID)
        const credential = EmailAuthProvider.credential(form.email, form.password);
        const linkRes = await linkWithCredential(auth.currentUser, credential);
        user = linkRes.user;
      } else {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        user = cred.user;
      }

      // Simpan user profile dengan emailVerified false
      await setDoc(doc(firestore, 'users', user.uid), {
        buyerName: form.name,
        phone: form.phone,
        street: form.street,
        role: 'buyer',
        email: form.email,
        profilePicture: '',
        area_id: form.area?.id + "IDZ" + form.area?.postal_code || '',
        province: form.area?.province || '',
        city: form.area?.city_name || '',
        district: form.area?.name || '',
        postal_code: form.area?.postal_code || '',
        address: makeAddress(form.street, form.area),
        area: areaWithoutId(form.area),
        createdAt: new Date(),
        emailVerified: false
      }, { merge: true });

      // Kirim email verifikasi dengan continue URL
      const actionCodeSettings = {
        url: `${SITE_URL}/please-verify?email=${encodeURIComponent(form.email)}`,
        handleCodeInApp: false
      };
      await sendEmailVerification(user, actionCodeSettings);

      // (Opsional) jika ingin langsung signOut setelah kirim verifikasi,
      // aktifkan baris di bawah ini (hapus komentar):
      // await auth.signOut();
      // router.push(`/please-verify?sent=1&email=${encodeURIComponent(form.email)}`);
      // Arahkan ke halaman instruksi verifikasi (user tetap login tapi dibatasi)
      router.push(`/please-verify?sent=1&email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      console.error('Error during registration:', err);
      setError(err.code === 'auth/email-already-in-use'
        ? 'Email sudah terdaftar.'
        : (err.message || 'Registrasi gagal. Silakan coba lagi.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-lg bg-white border border-red-100 rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">
          Lengkapi Pendaftaran Anda
        </h1>
        
        {error && (
          <div className="bg-red-100 text-red-700 text-sm p-3 mb-4 rounded border border-red-200">
            🛑 {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email dan Password di atas */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm text-dark mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="Contoh: example@email.com"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-dark mb-1">Kata Sandi</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? '👁️' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-dark mb-1">Konfirmasi Kata Sandi</label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Lainnya */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm text-dark mb-1">Nama Lengkap</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-dark mb-1">Alamat Jalan</label>
              <input
                type="text"
                name="street"
                value={form.street}
                onChange={handleChange}
                required
                placeholder="Contoh: Jl. Melati No.9B"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <AreaSelect label="Pilih Kecamatan / Kota" onSelect={handleAreaSelect} />

            {form.area && (
              <div className="grid grid-cols-2 gap-3 bg-gray-100 text-sm text-gray-700 border border-gray-300 p-3 rounded-md mt-2">
                <div>
                  <span className="block font-medium">Provinsi</span>
                  <span>{form.area.province}</span>
                </div>
                <div>
                  <span className="block font-medium">Kota/Kabupaten</span>
                  <span>{form.area.city_name}</span>
                </div>
                <div>
                  <span className="block font-medium">Kecamatan</span>
                  <span>{form.area.name}</span>
                </div>
                <div>
                  <span className="block font-medium">Kodepos</span>
                  <span>{form.area.postal_code}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-dark mb-1">No. HP / WhatsApp</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!form.name || !form.street || !form.phone || !form.area ||
                    !form.email || !form.password || !form.confirmPassword}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Mendaftarkan...' : 'Daftar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}