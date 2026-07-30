/**
 * ProductFilterBar
 * Reusable filter bar component for Phase, Type (MCCB), Kontaktor Type, Ampere, Voltage.
 * Only renders filters that have >= 1 option.
 */
export default function ProductFilterBar({
  // flags
  hasPhase = false,
  isMCCB = false,
  isLC1D = false,
  // available options
  availablePhases = [],
  availableTypes = [],
  availableKontaktorTypes = [],
  availableAmperes = [],
  availableVoltages = [],
  // active values
  phaseFilter,
  typeFilter,
  kontaktorTypeFilter,
  ampereFilter,
  voltageFilter,
  // setters
  setPhaseFilter,
  setTypeFilter,
  setKontaktorTypeFilter,
  setAmpereFilter,
  setVoltageFilter,
}) {
  const hasAnyFilter =
    (hasPhase && availablePhases.length >= 1) ||
    (isMCCB && availableTypes.length >= 1) ||
    (isLC1D && availableKontaktorTypes.length >= 1) ||
    (isLC1D && availableAmperes.length >= 1) ||
    (isLC1D && availableVoltages.length >= 1);

  if (!hasAnyFilter) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">

      {/* Phase Filter (MCB / MCCB / LC1D) */}
      {hasPhase && availablePhases.length >= 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 shrink-0">Phase:</span>
          <button
            onClick={() => setPhaseFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              !phaseFilter
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-red-300 hover:text-red-600'
            }`}
          >
            Semua
          </button>
          {availablePhases.map(phase => (
            <button
              key={phase}
              onClick={() => setPhaseFilter(phaseFilter === phase ? '' : phase)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                phaseFilter === phase
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-red-300 hover:text-red-600'
              }`}
            >
              {phase}
            </button>
          ))}
        </div>
      )}

      {/* Type Filter (MCCB) */}
      {isMCCB && availableTypes.length >= 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 shrink-0">Type:</span>
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              !typeFilter
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            Semua
          </button>
          {availableTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                typeFilter === type
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              Type {type}
            </button>
          ))}
        </div>
      )}

      {/* Type Filter (Kontaktor LC1D): M=220V, E=48V, F=110V, Q=380V, etc. */}
      {isLC1D && availableKontaktorTypes.length >= 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 shrink-0">Type:</span>
          <button
            onClick={() => setKontaktorTypeFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              !kontaktorTypeFilter
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            Semua
          </button>
          {availableKontaktorTypes.map(type => (
            <button
              key={type}
              onClick={() => setKontaktorTypeFilter(kontaktorTypeFilter === type ? '' : type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                kontaktorTypeFilter === type
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              Type {type}
            </button>
          ))}
        </div>
      )}

      {/* Ampere Filter (Kontaktor LC1D) */}
      {isLC1D && availableAmperes.length >= 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 shrink-0">Ampere:</span>
          <button
            onClick={() => setAmpereFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              !ampereFilter
                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-green-300 hover:text-green-600'
            }`}
          >
            Semua
          </button>
          {availableAmperes.map(amp => (
            <button
              key={amp}
              onClick={() => setAmpereFilter(ampereFilter === amp ? '' : amp)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                ampereFilter === amp
                  ? 'bg-green-600 text-white border-green-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-green-300 hover:text-green-600'
              }`}
            >
              {amp}
            </button>
          ))}
        </div>
      )}

      {/* Voltage Filter (Kontaktor LC1D) */}
      {isLC1D && availableVoltages.length >= 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 shrink-0">Voltage:</span>
          <button
            onClick={() => setVoltageFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              !voltageFilter
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-purple-300 hover:text-purple-600'
            }`}
          >
            Semua
          </button>
          {availableVoltages.map(volt => (
            <button
              key={volt}
              onClick={() => setVoltageFilter(voltageFilter === volt ? '' : volt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                voltageFilter === volt
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-300 hover:text-purple-600'
              }`}
            >
              {volt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
