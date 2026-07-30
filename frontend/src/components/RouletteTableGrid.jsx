import { colorOf, TABLE_GRID, BET_LABELS } from "@/lib/roulette";

/**
 * European roulette betting table with support for straight / split / street / corner bets.
 *
 * Props:
 *  - bets: { [betKey]: totalAmount }              e.g. { straight_5: 20, red: 10 }
 *  - onPlace: (betKey: string) => void            place a bet on a fully-formed bet key
 *  - onNumberSelect: (n: number) => void          when in split/corner mode: register number pick
 *  - onRemoveBetKey: (betKey: string) => void     remove all bets on a key (called on chip click)
 *  - disabled: boolean
 *  - resultNumber: number | null                  highlight winning cell during result phase
 *  - mode: "straight" | "split" | "corner"        current click mode
 *  - selectedNums: number[]                       numbers currently being combined in split/corner mode
 */
export default function RouletteTableGrid({
  bets = {},
  onPlace,
  onNumberSelect,
  onRemoveBetKey,
  disabled = false,
  resultNumber = null,
  mode = "straight",
  selectedNums = [],
}) {
  const centerChip = (key) => {
    const v = bets[key];
    if (!v) return null;
    return (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-auto"
        data-testid={`bet-chip-${key}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onRemoveBetKey?.(key);
        }}
        title="Click to remove this bet"
      >
        <div className="min-w-[30px] h-[24px] px-2 rounded-full bg-yellow-400 text-black text-[11px] font-black grid place-items-center border-2 border-yellow-700 shadow-[0_2px_5px_rgba(0,0,0,0.6)] hover:brightness-110 cursor-pointer">
          ₹{v}
        </div>
      </div>
    );
  };

  const numCellClicked = (n) => {
    if (disabled) return;
    if (mode === "straight") onPlace(`straight_${n}`);
    else onNumberSelect?.(n);
  };

  const numCell = (n) => {
    const c = colorOf(n);
    const bg =
      c === "green"
        ? "bg-emerald-600 hover:bg-emerald-500"
        : c === "red"
        ? "bg-red-600 hover:bg-red-500"
        : "bg-neutral-900 hover:bg-neutral-800";
    const winHighlight = resultNumber === n ? "ring-2 ring-yellow-300" : "";
    const selectedHighlight = selectedNums.includes(n) ? "ring-2 ring-cyan-300 ring-inset" : "";
    // Total on this cell = straight + any split/street/corner containing n
    const chipsOnCell = Object.keys(bets).filter((k) => keyContainsNumber(k, n));
    const totalOnCell = chipsOnCell.reduce((s, k) => s + (bets[k] || 0), 0);
    return (
      <button
        key={`n-${n}`}
        onClick={() => numCellClicked(n)}
        disabled={disabled}
        data-testid={`bet-straight-${n}`}
        className={`relative aspect-[3/2] ${bg} ${winHighlight} ${selectedHighlight} border border-white/15 text-white font-heading font-bold text-sm md:text-base grid place-items-center transition-all disabled:opacity-70 disabled:cursor-not-allowed`}
      >
        {n}
        {totalOnCell > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="min-w-[26px] h-[20px] px-1.5 rounded-full bg-yellow-400 text-black text-[10px] font-black grid place-items-center border-2 border-yellow-700 shadow-[0_2px_4px_rgba(0,0,0,0.55)]"
                 data-testid={`bet-total-${n}`}>
              ₹{totalOnCell}
            </div>
          </div>
        )}
      </button>
    );
  };

  const outsideBtn = (key, label, extraClass = "") => (
    <button
      onClick={() => !disabled && onPlace(key)}
      disabled={disabled}
      data-testid={`bet-${key}`}
      className={`relative py-3 md:py-4 border border-white/15 text-white font-heading font-bold text-xs md:text-sm hover:bg-white/5 transition-all disabled:opacity-70 disabled:cursor-not-allowed ${extraClass}`}
    >
      {label}
      {centerChip(key)}
    </button>
  );

  return (
    <div className="w-full max-w-3xl mx-auto" data-testid="roulette-betting-table">
      <div
        className="rounded-xl p-2 md:p-3 border border-yellow-900/40"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, #0e6e3a 0%, #093f22 70%, #052213 100%)",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.55)",
        }}
      >
        {/* Numbers area: 0 column + 3×12 grid */}
        <div className="flex gap-1">
          {/* Zero (spans 3 rows on the left) */}
          <button
            onClick={() => numCellClicked(0)}
            disabled={disabled}
            data-testid="bet-straight-0"
            className={`relative aspect-[1/3] w-[38px] md:w-[46px] bg-emerald-600 hover:bg-emerald-500 border border-white/15 text-white font-heading font-black text-xl grid place-items-center transition-all disabled:opacity-70 disabled:cursor-not-allowed ${
              resultNumber === 0 ? "ring-2 ring-yellow-300" : ""
            } ${selectedNums.includes(0) ? "ring-2 ring-cyan-300 ring-inset" : ""}`}
          >
            0
            {(() => {
              const total = Object.keys(bets).filter((k) => keyContainsNumber(k, 0)).reduce((s, k) => s + (bets[k] || 0), 0);
              return total > 0 ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="min-w-[26px] h-[20px] px-1.5 rounded-full bg-yellow-400 text-black text-[10px] font-black grid place-items-center border-2 border-yellow-700 shadow"
                       data-testid="bet-total-0">
                    ₹{total}
                  </div>
                </div>
              ) : null;
            })()}
          </button>

          {/* 3×12 grid */}
          <div className="flex-1 grid grid-cols-12 gap-1">
            {TABLE_GRID.flat().map((n) => numCell(n))}
          </div>
        </div>

        {/* Streets row (only 2 allowed per spec) + Dozens */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-3 gap-1">
            {outsideBtn("dozen_1", `${BET_LABELS.dozen_1} · 3:1`)}
            {outsideBtn("dozen_2", `${BET_LABELS.dozen_2} · 3:1`)}
            {outsideBtn("dozen_3", `${BET_LABELS.dozen_3} · 3:1`)}
          </div>
        </div>

        {/* Special Street buttons (0-1-2 and 0-2-3) */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-2 gap-1">
            {outsideBtn("street_0_1_2", "Street 0·1·2 · 11:1", "!bg-emerald-900/40 hover:!bg-emerald-800/50")}
            {outsideBtn("street_0_2_3", "Street 0·2·3 · 11:1", "!bg-emerald-900/40 hover:!bg-emerald-800/50")}
          </div>
        </div>

        {/* Even chances row */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-6 gap-1">
            {outsideBtn("low", "1–18")}
            {outsideBtn("even", "EVEN")}
            {outsideBtn("red", "RED", "!bg-red-600/40 hover:!bg-red-500/50")}
            {outsideBtn("black", "BLACK", "!bg-black/60 hover:!bg-black/80")}
            {outsideBtn("odd", "ODD")}
            {outsideBtn("high", "19–36")}
          </div>
        </div>
      </div>
    </div>
  );
}

// True if the bet key covers this number (straight / split / street / corner).
function keyContainsNumber(key, n) {
  if (key === `straight_${n}`) return true;
  if (key.startsWith("split_") || key.startsWith("street_") || key.startsWith("corner_")) {
    return key.split("_").slice(1).map(Number).includes(n);
  }
  return false;
}
