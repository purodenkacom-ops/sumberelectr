import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { firestore } from '@/utils/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { FaChevronDown, FaChevronRight, FaBorderAll, FaTimes } from 'react-icons/fa';

/**
 * Collapsible Tokopedia-style sidebar for category and subcategory filtering.
 * Works as a sticky sidebar on desktop, and a beautiful slide-up bottom sheet on mobile.
 *
 * Props:
 *   - currentCategorySlug: string (slug of current active parent category)
 *   - currentSubCategorySlug: string (slug of current active subcategory)
 *   - onCategorySelect: (categoryName: string, categorySlug: string) => void
 *   - onSubCategorySelect: (subCategoryName: string, subCategorySlug: string | null) => void
 *   - onClearFilters: () => void
 *   - isMobile: boolean (toggles mobile drawer mode)
 *   - isOpen: boolean (drawer open state for mobile)
 *   - onClose: () => void (drawer close callback)
 */
const ProductSidebar = ({
  currentCategorySlug = '',
  currentSubCategorySlug = '',
  onCategorySelect,
  onSubCategorySelect,
  onClearFilters,
  isMobile = false,
  isOpen = false,
  onClose,
}) => {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch categories & subcategories
  useEffect(() => {
    const qRef = query(collection(firestore, 'categories'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const cats = [];
        const subCats = [];

        snap.forEach((d) => {
          const data = d.data();
          const name = data.name || 'Kategori';
          const slug =
            data.slug ||
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');

          const catObj = {
            id: d.id,
            name,
            slug,
            parentId: data.parentId || null,
          };

          if (catObj.parentId) {
            subCats.push(catObj);
          } else {
            cats.push(catObj);
          }
        });

        // Sort alphabetically for nice presentation
        cats.sort((a, b) => a.name.localeCompare(b.name, 'id'));
        subCats.sort((a, b) => a.name.localeCompare(b.name, 'id'));

        setCategories(cats);
        setSubCategories(subCats);
        setLoading(false);

        // Auto-expand the active parent category if there's an active category slug
        if (currentCategorySlug) {
          const activeParent = cats.find((c) => c.slug === currentCategorySlug);
          if (activeParent) {
            setExpandedCategories((prev) => ({
              ...prev,
              [activeParent.id]: true,
            }));
          }
        }
      },
      (error) => {
        console.error('Failed to load sidebar categories:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentCategorySlug]);

  const toggleExpand = (catId, e) => {
    // Prevent event propagation if needed
    e.stopPropagation();
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleParentClick = (cat, e) => {
    e.preventDefault();

    // Toggle expand state
    setExpandedCategories((prev) => ({
      ...prev,
      [cat.id]: !prev[cat.id],
    }));

    // Trigger select callback
    if (onCategorySelect) {
      onCategorySelect(cat.name, cat.slug);
    }
  };

  const handleSubClick = (subCat, parentSlug, e) => {
    e.preventDefault();
    if (onSubCategorySelect) {
      onSubCategorySelect(subCat.name, subCat.slug, parentSlug);
    }
  };

  if (loading) {
    if (isMobile) {
      if (!isOpen) return null;
      return (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2rem] p-6 shadow-2xl h-[40vh] animate-pulse flex flex-col gap-4">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
          </div>
        </div>
      );
    }
    return (
      <div className="w-full bg-white border border-red-50 rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-2/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded w-full"></div>
          <div className="h-4 bg-gray-100 rounded w-5/6"></div>
          <div className="h-4 bg-gray-100 rounded w-4/5"></div>
          <div className="h-4 bg-gray-100 rounded w-full"></div>
        </div>
      </div>
    );
  }

  // --- MOBILE DRAWER RENDER ---
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 lg:hidden">
        {/* Backdrop overlay */}
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
        />
        {/* Bottom sheet */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2rem] shadow-2xl max-h-[85vh] flex flex-col z-50 animate-slide-up pb-6"
          style={{ willChange: 'transform' }}
        >
          {/* Top drag handle indicator and header */}
          <div className="flex flex-col items-center pt-3 pb-3 border-b border-gray-100 px-6">
            <div className="w-12 h-1 bg-gray-200 rounded-full mb-3 cursor-pointer" onClick={onClose} />
            <div className="flex items-center justify-between w-full">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <FaBorderAll className="text-red-600" size={16} />
                Pilih Brand
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-all cursor-pointer"
                aria-label="Tutup"
              >
                <FaTimes size={16} />
              </button>
            </div>
          </div>

          {/* Categories List (Scrollable) */}
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {/* Semua Produk / Clear Filters button */}
            <button
              onClick={() => {
                if (onClearFilters) {
                  onClearFilters();
                } else {
                  router.push('/all-product');
                }
              }}
              className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 flex items-center justify-between cursor-pointer ${
                !currentCategorySlug
                  ? 'bg-red-50 text-red-700 font-bold'
                  : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <span>Semua Produk</span>
            </button>

            {/* Accordion Categories */}
            <div className="space-y-1.5">
              {categories.map((cat) => {
                const isSelected = currentCategorySlug === cat.slug;
                const isExpanded = !!expandedCategories[cat.id];
                const catSubCats = subCategories.filter((sub) => sub.parentId === cat.id);

                return (
                  <div key={cat.id} className="border-b border-gray-50 last:border-b-0 pb-2 pt-2 first:pt-0">
                    <div
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 transition-all duration-200 ${
                        isSelected
                          ? 'bg-red-50 text-red-700 font-bold'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <a
                        href={`/category/${cat.slug}`}
                        onClick={(e) => handleParentClick(cat, e)}
                        className="flex-grow text-sm font-medium select-none cursor-pointer"
                      >
                        {cat.name}
                      </a>

                      {catSubCats.length > 0 && (
                        <button
                          onClick={(e) => toggleExpand(cat.id, e)}
                          className="p-1.5 rounded hover:bg-gray-200/50 text-gray-400 hover:text-gray-600 cursor-pointer"
                          aria-label="Toggle subcategories"
                        >
                          {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                        </button>
                      )}
                    </div>

                    {/* Subcategories (Collapsible list) */}
                    {isExpanded && catSubCats.length > 0 && (
                      <div className="pl-5 mt-2 space-y-1 border-l-2 border-red-100 ml-4">
                        {catSubCats.map((sub) => {
                          const isSubSelected = currentSubCategorySlug === sub.slug;
                          return (
                            <a
                              key={sub.id}
                              href="#"
                              onClick={(e) => handleSubClick(sub, cat.slug, e)}
                              className={`block px-3 py-2 rounded-lg text-xs transition-all duration-200 select-none cursor-pointer ${
                                isSubSelected
                                  ? 'bg-red-100/50 text-red-700 font-bold shadow-sm'
                                  : 'text-gray-500 hover:text-red-600 hover:bg-gray-50'
                              }`}
                            >
                              {sub.name}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Self-contained CSS Animations */}
        <style jsx="true">{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .animate-slide-up {
            animation: slideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .animate-fade-in {
            animation: fadeIn 0.22s ease-out forwards;
          }
        `}</style>
      </div>
    );
  }

  // --- DESKTOP SIDEBAR RENDER ---
  return (
    <aside className="w-full bg-white border border-red-100 rounded-2xl p-5 shadow-sm sticky top-28 max-h-[calc(100vh-140px)] overflow-y-auto">
      <h2 className="text-base font-bold text-gray-800 mb-4 border-b border-gray-100 pb-3 flex items-center gap-2">
        <FaBorderAll className="text-red-600" size={16} />
        Brand
      </h2>

      {/* Semua Produk / Clear Filters button */}
      <button
        onClick={() => {
          if (onClearFilters) {
            onClearFilters();
          } else {
            router.push('/all-product');
          }
        }}
        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-3 flex items-center justify-between cursor-pointer ${
          !currentCategorySlug
            ? 'bg-red-50 text-red-700 font-semibold'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span>Semua Produk</span>
      </button>

      {/* Accordion Categories */}
      <div className="space-y-1">
        {categories.map((cat) => {
          const isSelected = currentCategorySlug === cat.slug;
          const isExpanded = !!expandedCategories[cat.id];
          const catSubCats = subCategories.filter((sub) => sub.parentId === cat.id);

          return (
            <div key={cat.id} className="border-b border-gray-50 last:border-b-0 pb-1.5 pt-1.5 first:pt-0">
              <div
                className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all duration-200 ${
                  isSelected
                    ? 'bg-red-50 text-red-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <a
                  href={`/category/${cat.slug}`}
                  onClick={(e) => handleParentClick(cat, e)}
                  className="flex-grow text-sm font-medium hover:text-red-700 select-none cursor-pointer"
                >
                  {cat.name}
                </a>

                {catSubCats.length > 0 && (
                  <button
                    onClick={(e) => toggleExpand(cat.id, e)}
                    className="p-1 rounded hover:bg-gray-200/50 text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Toggle subcategories"
                  >
                    {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                  </button>
                )}
              </div>

              {/* Subcategories (Collapsible list) */}
              {isExpanded && catSubCats.length > 0 && (
                <div className="pl-5 mt-1.5 space-y-1 border-l-2 border-red-50/50 ml-3.5">
                  {catSubCats.map((sub) => {
                    const isSubSelected = currentSubCategorySlug === sub.slug;
                    return (
                      <a
                        key={sub.id}
                        href="#"
                        onClick={(e) => handleSubClick(sub, cat.slug, e)}
                        className={`block px-3 py-1.5 rounded-lg text-xs transition-all duration-200 select-none cursor-pointer ${
                          isSubSelected
                            ? 'bg-red-100/50 text-red-700 font-semibold shadow-sm'
                            : 'text-gray-500 hover:text-red-600 hover:bg-gray-50'
                        }`}
                      >
                        {sub.name}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default ProductSidebar;
