import { useState, useEffect, useRef } from 'react';
import debounce from 'lodash.debounce';

const debouncedFetch = debounce((fetchAreas, q) => {
  fetchAreas(q);
}, 400);

const AreaSelect = ({ onSelect, label, value = null }) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState('bottom');
  const inputRef = useRef();
  const hasSelected = useRef(false);

  useEffect(() => {
    if (!value) return;
    const text = [value.name, value.city_name, value.province].filter(Boolean).join(', ');
    setQuery(text);
    hasSelected.current = true;
  }, [value]);

  const fetchAreas = async (q) => {
    if (!q || hasSelected.current) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/biteship/areas?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Gagal mengambil data area');
      const data = await res.json();
      // Deduplicate by id to avoid React key collisions
      const seen = new Set();
      const unique = [];
      for (const a of data) {
        const id = String(a?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(a);
      }
      setOptions(unique.slice(0, 10));
    } catch (err) {
      console.error('Error fetching areas:', err);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    debouncedFetch(fetchAreas, query);
    return () => debouncedFetch.cancel();
  }, [query]);

  // Tambah: Deteksi posisi dropdown saat options muncul
  useEffect(() => {
    if (options.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const dropdownHeight = Math.min(10 * 44, 240); // estimasi tinggi max dropdown (10 opsi * 44px)
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Jika ruang di bawah kurang dari tinggi dropdown + margin, dan ruang atas lebih besar, tampilkan ke atas
      if (spaceBelow < dropdownHeight + 20 && spaceAbove > spaceBelow) {
        setDropdownDirection('top');
      } else {
        setDropdownDirection('bottom');
      }
    }
  }, [options]);

  const handleSelect = (area) => {
    console.log('[AreaSelect] Raw area data:', area);
    
    // Biteship uses administrative_division_level_*_name (with _name suffix)
    let district = area.administrative_division_level_3_name || area.administrative_division_level_3 || '';
    
    // Fallback: if admin level not available, try to parse from name (first part before comma)
    if (!district && area.name) {
      const parts = area.name.split(',');
      district = parts[0]?.trim() || area.name;
    }
    
    // Extract city - use *_name fields
    const city = area.administrative_division_level_2_name || area.administrative_division_level_2 || area.city_name || area.city || '';
    
    // Extract province - use *_name fields
    const province = area.administrative_division_level_1_name || area.administrative_division_level_1 || area.province || '';
    
    // Postal code from country_code concatenated fields or direct postal_code
    let postal = area.postal_code || '';
    // Sometimes Biteship returns postal in the name field after period
    if (!postal && area.name) {
      const match = area.name.match(/\.\s*(\d{5})/);
      if (match) postal = match[1];
    }

    const normalized = {
      id: area.id,
      name: district,
      city_name: city,
      province,
      postal_code: postal,
      lat: area.latitude || area.lat || null,
      lng: area.longitude || area.lng || null,
      raw: area,
    };
    
    console.log('[AreaSelect] Normalized data:', normalized);
    
    onSelect(normalized);

    hasSelected.current = true;
    setQuery([district, city, province].filter(Boolean).join(', '));
    setOptions([]);
    setTimeout(() => {
      hasSelected.current = false;
    }, 500);
  };

  return (
    <div className="mb-4 relative">
      <label className="block text-lg font-medium text-gray-700">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          hasSelected.current = false;
          setQuery(e.target.value);
        }}
        className="w-full px-4 py-2 border border-gray-300 rounded-md"
        placeholder="Contoh: Tajurhalang, Bandung"
      />
      {loading && <div className="text-sm text-gray-500 mt-1">Memuat data…</div>}
      {options.length > 0 && (
        <ul
          className={
            `absolute w-full border rounded bg-white shadow max-h-60 overflow-auto z-50 transition-all
            ${dropdownDirection === 'top'
              ? 'bottom-full mb-1'
              : 'mt-1'}`
          }
          style={{ left: 0 }}
        >
          {options.map((area, idx) => (
            <li
              key={area.id || idx}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleSelect(area)}
            >
              <strong>{area.administrative_division_level_3 || area.name}</strong>, {area.administrative_division_level_2 || area.city_name || area.city} <br />
              <span className="text-xs text-gray-500">{area.administrative_division_level_1 || area.province} • Kodepos: {area.postal_code || '-'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AreaSelect;