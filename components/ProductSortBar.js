import { useState } from 'react';
import { FaSortAlphaDown, FaSortAmountDown, FaSortAmountUp, FaFire, FaClock } from 'react-icons/fa';

/**
 * Desktop-only product sort bar with filter pills.
 * Sort options: A-Z, Harga Terendah, Harga Tertinggi, Banyak Terjual, Item Terbaru
 *
 * Props:
 *   - activeSort: string (current sort key)
 *   - onSortChange: (sortKey: string) => void
 *   - totalCount: number (optional, total filtered product count)
 */

const SORT_OPTIONS = [
  { key: 'default', label: 'Default', icon: null },
  { key: 'az', label: 'A — Z', icon: FaSortAlphaDown },
  { key: 'price-asc', label: 'Harga Terendah', icon: FaSortAmountUp },
  { key: 'price-desc', label: 'Harga Tertinggi', icon: FaSortAmountDown },
  { key: 'best-selling', label: 'Terlaris', icon: FaFire },
  { key: 'newest', label: 'Terbaru', icon: FaClock },
];

const ProductSortBar = ({ activeSort = 'default', onSortChange, totalCount }) => {
  return (
    // Hidden on mobile, visible on lg+ (desktop)
    <div className="hidden lg:block mb-5">
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-red-100 shadow-sm"
        style={{
          backdropFilter: 'blur(8px)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(254,242,242,0.85) 100%)',
        }}
      >
        <span className="text-sm font-semibold text-gray-500 mr-2 whitespace-nowrap select-none">
          Urutkan:
        </span>

        <div className="flex items-center gap-1.5 flex-wrap">
          {SORT_OPTIONS.map((opt) => {
            const isActive = activeSort === opt.key;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => onSortChange(opt.key)}
                className={`
                  inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium
                  transition-all duration-200 ease-out cursor-pointer select-none
                  border whitespace-nowrap
                  ${
                    isActive
                      ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
                  }
                `}
                aria-pressed={isActive}
                title={opt.label}
              >
                {Icon && (
                  <Icon
                    size={13}
                    className={`transition-colors duration-200 ${
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-red-500'
                    }`}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>

        {typeof totalCount === 'number' && (
          <span className="ml-auto text-xs text-gray-400 whitespace-nowrap select-none">
            {totalCount} produk
          </span>
        )}
      </div>
    </div>
  );
};

export default ProductSortBar;
