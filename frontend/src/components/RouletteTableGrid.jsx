import { colorOf, TABLE_GRID, BET_LABELS } from "@/lib/roulette";

/**
 * European roulette betting table.
 *
 * Props:
 *  - bets: { [betKey]: totalAmount }   e.g. { straight_5: 20, red: 10 }
 *  - onPlace: (betKey: string) => void
 *  - disabled: boolean                 e.g. when betting phase is closed
 *  - resultNumber: number | null       used to highlight winning cell
 */
export default function RouletteTableGrid({ bets = {}, onPlace, disabled = false, resultNumber = null }) {
  // Centered chip badge (used for outside bets — dozens, red/black, etc.)
  const centerChip = (key) => {
    const v = bets[key];
    if (!v) return null;
    return (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        data-testid={`bet-chip-${key}`}
      >
        <div className="min-w-[30px] h-[24px] px-2 rounded-full bg-yellow-400 text-black text-[11px] font-black grid place-items-center border-2 border-yellow-700 shadow-[0_2px_5px_rgba(0,0,0,0.6)]">
          ₹{v}
        </div>
      </div>
    );
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
    return (
      <button
        key={`n-${n}`}
        onClick={() => !disabled && onPlace(`straight_${n}`)}
        disabled={disabled}
        data-testid={`bet-straight-${n}`}
        className={`relative aspect-[3/2] ${bg} ${winHighlight} border border-white/15 text-white font-heading font-bold text-sm md:text-base grid place-items-center transition-all disabled:opacity-70 disabled:cursor-not-allowed`}
      >
        {n}
        {centerChip(`straight_${n}`)}
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
      {/* Green felt background */}
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
            onClick={() => !disabled && onPlace("straight_0")}
            disabled={disabled}
            data-testid="bet-straight-0"
            className={`relative aspect-[1/3] w-[38px] md:w-[46px] bg-emerald-600 hover:bg-emerald-500 border border-white/15 text-white font-heading font-black text-xl grid place-items-center transition-all disabled:opacity-70 disabled:cursor-not-allowed ${
              resultNumber === 0 ? "ring-2 ring-yellow-300" : ""
            }`}
          >
            0
            {centerChip("straight_0")}
          </button>

          {/* 3×12 grid */}
          <div className="flex-1 grid grid-cols-12 gap-1">
            {TABLE_GRID.flat().map((n) => numCell(n))}
          </div>
        </div>

        {/* Dozens row */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-3 gap-1">
            {outsideBtn("dozen_1", `${BET_LABELS.dozen_1} · 3:1`)}
            {outsideBtn("dozen_2", `${BET_LABELS.dozen_2} · 3:1`)}
            {outsideBtn("dozen_3", `${BET_LABELS.dozen_3} · 3:1`)}
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
