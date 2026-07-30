/**
 * Shared product filter utilities.
 * Used by SubcategoryProductTable and CategoryPage.
 */

/** Detect if a list of products should show Phase filter (MCB / MCCB / LC1D) */
export function detectIsKontaktorLC1D(products = []) {
  return products.some(p => {
    const name = (p.name || '').toLowerCase();
    const sub = (p.subCategory || p.subCategorySlug || '').toLowerCase();
    return name.includes('lc1d') || sub.includes('lc1d');
  });
}

export function detectHasPhaseFilter(products = []) {
  const isLC1D = detectIsKontaktorLC1D(products);
  return products.some(p => {
    const sub = (p.subCategory || p.subCategorySlug || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return sub.includes('mcb') || sub.includes('mccb') || name.includes('mcb') || name.includes('mccb') || isLC1D;
  });
}

export function detectIsMCCB(products = []) {
  return products.some(p => {
    const name = (p.name || '').toLowerCase();
    const sub = (p.subCategory || p.subCategorySlug || '').toLowerCase();
    return name.includes('mccb') || sub.includes('mccb');
  });
}

/** Extract phase from product name: "3P" → "3P" */
export function getPhase(name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  for (let p = 4; p >= 1; p--) {
    const tag = `${p}P`;
    const idx = upper.indexOf(tag);
    if (idx >= 0) {
      const charBefore = idx === 0 ? ' ' : upper[idx - 1];
      const charAfter = idx + tag.length >= upper.length ? ' ' : upper[idx + tag.length];
      const beforeOk = !/[A-Z0-9]/.test(charBefore);
      const afterOk = !/[A-Z0-9]/.test(charAfter);
      if (beforeOk && afterOk) return tag;
    }
  }
  return null;
}

/** Extract MCCB type letter: EZC250H → "H", NSX100F → "F" */
export function getMCCBType(name) {
  if (!name) return null;
  const match = name.toUpperCase().match(/\b([A-Z]{2,}\d+)([A-Z])\b/);
  return match ? match[2] : null;
}

/**
 * Extract Kontaktor LC1D type letter from model code.
 * Pattern: LC1D<digits><TypeLetter><digits>
 * Examples: LC1D09M7 → "M", LC1D09E7 → "E", LC1D09F7 → "F", LC1D09Q7 → "Q"
 */
export function getKontaktorType(name) {
  if (!name) return null;
  const match = name.toUpperCase().match(/LC1D\d+([A-Z])\d/);
  return match ? match[1] : null;
}

/** Extract ampere value: "38A" → "38A" */
export function getAmpere(name) {
  if (!name) return null;
  const match = name.toUpperCase().match(/\b(\d+A)\b/);
  return match ? match[1] : null;
}

/** Extract voltage value: "220VAC" → "220VAC", "48VAC" → "48VAC", "220V" → "220V" */
export function getVoltage(name) {
  if (!name) return null;
  const match = name.toUpperCase().match(/\b(\d+V(?:AC|DC)?)\b/);
  return match ? match[1] : null;
}

/** Compute all available filter values from a list of products */
export function computeAvailableFilters(products = []) {
  const isLC1D = detectIsKontaktorLC1D(products);
  const hasPhase = detectHasPhaseFilter(products);
  const isMCCB = detectIsMCCB(products);

  const availablePhases = hasPhase
    ? [...new Set(products.map(p => getPhase(p.name)).filter(Boolean))].sort()
    : [];

  const availableTypes = isMCCB
    ? [...new Set(products.map(p => getMCCBType(p.name)).filter(Boolean))].sort()
    : [];

  // Kontaktor LC1D: type filter (M, E, F, Q, ...)
  const availableKontaktorTypes = isLC1D
    ? [...new Set(products.map(p => getKontaktorType(p.name)).filter(Boolean))].sort()
    : [];

  const availableAmperes = isLC1D
    ? [...new Set(products.map(p => getAmpere(p.name)).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b))
    : [];

  const availableVoltages = isLC1D
    ? [...new Set(products.map(p => getVoltage(p.name)).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b))
    : [];

  return {
    hasPhase, isMCCB, isLC1D,
    availablePhases, availableTypes,
    availableKontaktorTypes,
    availableAmperes, availableVoltages,
  };
}

/** Apply all active filters to a product list */
export function applyProductFilters(products = [], {
  searchTerm,
  phaseFilter,
  typeFilter,
  kontaktorTypeFilter,
  ampereFilter,
  voltageFilter,
}) {
  return products.filter(p => {
    const matchesSearch = !searchTerm ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku || p.id)?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPhase = !phaseFilter || getPhase(p.name) === phaseFilter;
    const matchesType = !typeFilter || getMCCBType(p.name) === typeFilter;
    const matchesKontaktorType = !kontaktorTypeFilter || getKontaktorType(p.name) === kontaktorTypeFilter;
    const matchesAmpere = !ampereFilter || getAmpere(p.name) === ampereFilter;
    const matchesVoltage = !voltageFilter || getVoltage(p.name) === voltageFilter;
    return matchesSearch && matchesPhase && matchesType && matchesKontaktorType && matchesAmpere && matchesVoltage;
  });
}
