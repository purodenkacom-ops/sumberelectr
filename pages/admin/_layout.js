import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

// SVG icons
const icons = {
  Dashboard: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8v-10h-8v10zm0-18v6h8V3h-8z" /></svg>
  ),
  Products: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 8l-8 4.5L4 8m16-3.5L12 2 4 4.5M20 8v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8" /></svg>
  ),
  'Benner Setting': (
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
  { name: 'Article Upload', href: '/admin/article-upload' },
];

export default function AdminLayout({ children, title = 'Admin' }) {
  const router = useRouter();
  const { user, role, loading: authLoading, logout } = useAuth();
  const current = router.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (role !== 'admin') {
      router.replace('/');
    }
  }, [user, role, authLoading, router]);

  if (authLoading || !user || role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 text-sm">Memeriksa hak akses admin...</div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
  };

  const MobileSidebar = () => (
    <div className={`fixed inset-0 z-50 flex lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setSidebarOpen(false)}
      />
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
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer hover:bg-red-800 transition text-left mt-auto"
          >
            {icons.Logout}
            <span>Logout</span>
          </button>
        </nav>
      </aside>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      <MobileSidebar />

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col bg-red-700 text-white transition-all duration-300 ${minimized ? 'w-20' : 'w-64'} p-4 justify-between shadow-xl`}>
        <div>
          <div className="flex items-center justify-between mb-8">
            {!minimized && <h2 className="text-2xl font-bold tracking-wider">Purodenka</h2>}
            <button
              onClick={() => setMinimized(!minimized)}
              className="p-1 rounded hover:bg-red-600 focus:outline-none mx-auto"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href}>
                <span className={`flex items-center gap-4 px-3 py-3 rounded-xl cursor-pointer hover:bg-red-800 transition ${current === item.href ? 'bg-red-800 font-bold shadow-md' : ''}`}>
                  {icons[item.name]}
                  {!minimized && <span>{item.name}</span>}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-red-800 transition text-left"
        >
          {icons.Logout}
          {!minimized && <span>Logout</span>}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between bg-white px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">Admin</span>
            <span className="text-sm font-medium text-gray-700">{user.email}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
