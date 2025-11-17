import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore } from '@/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

// SVG icons (can be replaced with your icon library or SVG imports)
const icons = {
  Dashboard: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8v-10h-8v10zm0-18v6h8V3h-8z" /></svg>
  ),
  Products: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 8l-8 4.5L4 8m16-3.5L12 2 4 4.5M20 8v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8" /></svg>
  ),
  'Benner Setting': (
    // store setting icon (shop/storefront)
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V9a4 4 0 00-8 0v2M4 11h16l-1.34 7.34A2 2 0 0116.7 20H7.3a2 2 0 01-1.96-1.66L4 11z" />
    </svg>
  ),
  Orders: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7h18M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" /><path d="M9 3v4m6-4v4" /></svg>
  ),
  
  Chat: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4-4.03 7-9 7a9.77 9.77 0 0 1-4-.8L3 21l1.8-4A7.96 7.96 0 0 1 3 12c0-4 4.03-7 9-7s9 3 9 7z" /></svg>
  ),
  Statistics: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 3v18h18"/><rect width="3" height="8" x="7" y="7" rx="1"/><rect width="3" height="13" x="13" y="2" rx="1"/></svg>
  ),
  'Voucher': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 3l3.09 6.26L22 10.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 15.14l-5-4.87 6.91-1.01z" /></svg>
  ),
  Settings: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09c.35.14.68.36 1 .64.32.28.59.62.83 1 .24.38.41.82.53 1.28.12.46.19.95.18 1.44a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
  Logout: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
    </svg>
  ),
  'Article Upload': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M12 19v-6m0 0V5m0 8h6m-6 0H6" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  ),
};

const navItems = [
  { name: 'Dashboard', href: '/admin/dashboard' },
  { name: 'Products', href: '/admin/products' },
  { name: 'Benner Setting', href: '/admin/benner' },
  { name: 'Orders', href: '/admin/orders' },
  { name: 'Chat', href: '/admin/chat' },
    { name: 'Voucher', href: '/admin/voucher' },
  { name: 'Settings', href: '/admin/settings' },
  { name: 'Article Upload', href: '/admin/article-upload' }, // <-- Tambahkan baris ini
];

export default function AdminLayout({ children, title = 'Admin' }) {
  const router = useRouter();
  const current = router.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false); // for mobile drawer
  const [minimized, setMinimized] = useState(false); // for desktop minimize
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setIsAdmin(false);
        setChecking(false);
        router.replace('/'); // redirect jika belum login
        return;
      }
      try {
        const snap = await getDoc(doc(firestore, 'users', u.uid));
        const data = snap.exists() ? snap.data() : {};
        const ok = data.role === 'admin' || data.isAdmin === true;
        if (!ok) {
          setIsAdmin(false);
          setChecking(false);
          router.replace('/'); // redirect jika bukan admin
          return;
        }
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        router.replace('/');
      } finally {
        if (mounted.current) setChecking(false);
      }
    });
    return () => {
      mounted.current = false;
      unsub && unsub();
    };
  }, [router]);

  // Dummy logout handler (replace with your actual logout logic)
  const handleLogout = () => {
    // Example: remove token, call logout api, etc
    // localStorage.removeItem('token');
    // router.push('/login');
    // window.location.reload();
    // For now, just route to login
    router.push('/login');
  };

  // Mobile sidebar (slide out, full overlay)
  const MobileSidebar = () => (
    <div className={`fixed inset-0 z-50 flex lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setSidebarOpen(false)}
      />
      {/* Sidebar */}
      <aside className={`relative w-64 max-w-full bg-red-700 text-white flex flex-col p-4 space-y-2 shadow-2xl transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold">Purodenka</h2>
          <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-red-600 rounded-md">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link key={item.name} href={item.href} onClick={() => setSidebarOpen(false)}>
              <span className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer hover:bg-red-800 transition ${current === item.href ? 'bg-red-800 font-semibold' : ''}`}>
                {icons[item.name]}
                <span>{item.name}</span>
              </span>
            </Link>
          ))}
          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-800 transition mt-2 text-left"
          >
            {icons.Logout}
            <span>Logout</span>
          </button>
        </nav>
      </aside>
    </div>
  );

  // Desktop sidebar (can be minimized)
  const DesktopSidebar = () => (
    <aside
      className={`
        hidden lg:fixed lg:inset-y-0 lg:flex flex-col bg-red-700 text-white transition-all duration-300
        ${minimized ? 'w-20' : 'w-64'}
        z-40
      `}
      style={{ left: 0, top: 0, bottom: 0 }}
    >
      <div className={`flex items-center justify-between mb-8 mt-5 px-4 ${minimized ? 'justify-center' : ''}`}>
  {!minimized && <h2 className="text-xl font-bold">Purodenka</h2>}
        <button
          aria-label="Toggle sidebar"
          onClick={() => setMinimized((v) => !v)}
          className="p-2 hover:bg-red-600 rounded-md"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2}>
            {minimized
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            }
          </svg>
        </button>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => (
          <Link key={item.name} href={item.href}>
            <span className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer hover:bg-red-800 transition ${current === item.href ? 'bg-red-800 font-semibold' : ''} ${minimized ? 'justify-center px-2' : ''}`}>
              {icons[item.name]}
              {!minimized && <span className="truncate">{item.name}</span>}
            </span>
          </Link>
        ))}
        {/* Logout button */}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-800 transition mt-2 text-left ${minimized ? 'justify-center px-2' : ''}`}
        >
          {icons.Logout}
          {!minimized && <span>Logout</span>}
        </button>
      </nav>
      {!minimized && (
        <div className="mt-6 text-xs text-center text-gray-100 opacity-70 mb-6">© 2025 CodeCana13</div>
      )}
    </aside>
  );

  // Re-add shift class (hilang di versi terakhir)
  const mainShift = minimized ? 'lg:ml-20' : 'lg:ml-64';

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-600">Memeriksa akses...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar (desktop + mobile overlay) */}
      <DesktopSidebar />
      <MobileSidebar />

      {/* Top bar */}
      <header className={`bg-white border-b px-4 py-3 flex items-center gap-4 sticky top-0 z-40 ${mainShift}`}>
        {/* Mobile toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-2 rounded-md border text-gray-600 hover:bg-gray-50"
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <h1 className="text-sm font-semibold text-gray-800 truncate">{title}</h1>
        <div className="flex-1" />
        <button
          onClick={() => auth.signOut().then(()=>router.replace('/'))}
          className="text-[11px] px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
        >
          Keluar
        </button>
      </header>

      {/* Main content */}
      <main className={`${mainShift} p-4`}>
        {children}
      </main>
    </div>
  );
}