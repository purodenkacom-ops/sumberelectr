import Link from 'next/link';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';

export default function ArticleHeader({ search, setSearch }) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header className="bg-gradient-to-r from-primary/90 to-secondary/80 py-4 mb-4 rounded-xl border border-red-100 text-white text-center relative">
      <div className="flex items-center max-w-4xl mx-auto px-2 mb-3 justify-start">
        {/* Logo website */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Logo Purodenka"
            className="h-12 w-12 rounded-full border border-white/30"
            style={{ objectFit: 'cover' }}
          />
          <span className="font-bold text-2xl text-white tracking-tight">
            Purodenka
          </span>
        </Link>
        {/* Spacer */}
        <div className="flex-1" />
        {/* Search bar desktop */}
        <div className="hidden md:block w-full max-w-xs ml-4 md:ml-0 md:w-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari artikel..."
            className="w-full px-3 py-2 rounded-lg border border-red-200 text-gray-700 focus:outline-none focus:ring focus:ring-primary/30 text-sm"
            style={{ minWidth: 120, maxWidth: 320 }}
          />
        </div>
        {/* Search icon mobile */}
        <button
          className="md:hidden flex items-center justify-center ml-2 bg-white text-primary rounded-full border border-primary/20 hover:bg-primary hover:text-white transition"
          style={{ width: 40, height: 40 }}
          aria-label="Cari artikel"
          onClick={() => setShowSearch(true)}
        >
          <FontAwesomeIcon icon={faSearch} size="lg" />
        </button>
      </div>
      {/* Modal search mobile */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-sm mx-auto">
            <div className="flex items-center mb-3">
              <input
                type="text"
                value={search}
                autoFocus
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari artikel..."
                className="w-full px-3 py-2 rounded-lg border border-red-200 text-gray-700 focus:outline-none focus:ring focus:ring-primary/30 text-base"
              />
              <button
                className="ml-2 text-gray-500 hover:text-primary"
                onClick={() => setShowSearch(false)}
                aria-label="Tutup"
              >
                &times;
              </button>
            </div>
            <div className="text-xs text-gray-400 mb-2">Ketik judul atau kata kunci artikel</div>
          </div>
        </div>
      )}
    </header>
  );
}