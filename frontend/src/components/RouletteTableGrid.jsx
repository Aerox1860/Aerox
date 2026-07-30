import { colorOf, TABLE_GRID, BET_LABELS, enumerateSplitHotspots, enumerateCornerHotspots } from "@/lib/roulette";

/**
 * European roulette betting table with direct-click hotspots for split & corner bets.
 *
 * Layout (viewBox coordinates):
 *   • Number grid inner area = 12 columns × 3 rows of 100×100 units → 1200×300.
 *   • Split hotspots: small rects straddling the boundary between two adjacent cells.
 *   • Corner hotspots: small circles at the intersection of 4 adjacent cells.
 *
 * The user clicks directly on the boundary/intersection — no mode switching, no multi-tap.
 *
 * Props:
 *  - bets: { [betKey]: totalAmount }
 *  - onPlace: (betKey: string) => void
 *  - disabled: boolean
 *  - resultNumber: number | null
 */
export default function RouletteTableGrid({
  bets = {},
  onPlace,
  disabled = false,
  resultNumber = null,
}) {
  const splitHotspots = enumerateSplitHotspots();
  const cornerHotspots = enumerateCornerHotspots();

  // Chip badge that overlays a number/outside button (pointer-events-none so it never
  // steals clicks — multi-click on same bet ADDS a chip).
  const chipOverlay = (key) => {
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
        data-testid={`bet-straight-${n}`}
        className={`relative aspect-[3/2] ${bg} ${winHighlight} rounded-lg border border-white/25 text-white font-heading font-bold text-sm md:text-base grid place-items-center transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-2px_0_rgba(0,0,0,0.35)] ${disabled ? "pointer-events-none" : ""}`}
      >
        {n}
        {chipOverlay(`straight_${n}`)}
      </button>
    );
  };

  const outsideBtn = (key, label, extraClass = "") => (
    <button
      onClick={() => !disabled && onPlace(key)}
      data-testid={`bet-${key}`}
      className={`relative py-3 md:py-4 border border-white/15 text-white font-heading font-bold text-xs md:text-sm hover:bg-white/5 transition-all ${disabled ? "pointer-events-none" : ""} ${extraClass}`}
    >
      {label}
      {chipOverlay(key)}
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
        {/* Numbers area: 0 column + 3×12 grid + SVG hotspot overlay */}
        <div className="flex gap-1">
          {/* Zero (spans 3 rows on the left) */}
          <button
            onClick={() => !disabled && onPlace("straight_0")}
            data-testid="bet-straight-0"
            className={`relative aspect-[1/3] w-[38px] md:w-[46px] bg-emerald-600 hover:bg-emerald-500 rounded-lg border border-white/25 text-white font-heading font-black text-xl grid place-items-center transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-2px_0_rgba(0,0,0,0.35)] ${disabled ? "pointer-events-none" : ""} ${
              resultNumber === 0 ? "ring-2 ring-yellow-300" : ""
            }`}
          >
            0
            {chipOverlay("straight_0")}
          </button>

          {/* 3×12 grid with hotspot SVG overlay */}
          <div className="relative flex-1">
            <div className="grid grid-cols-12 gap-1.5">
              {TABLE_GRID.flat().map((n) => numCell(n))}
            </div>

            {/* SVG hotspot overlay — click BETWEEN cells for splits & corners */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 1200 300"
              preserveAspectRatio="none"
              style={{ pointerEvents: "none" }}
            >
              {/* Split hotspots — highlighted connector strip along the shared edge between two cells. */}
              {splitHotspots.map((h) => {
                const isHorizontalSplit = h.y === 50 || h.y === 150 || h.y === 250;
                const w = isHorizontalSplit ? 20 : 78;
                const hgt = isHorizontalSplit ? 78 : 20;
                const placed = !!bets[h.key];
                return (
                  <g key={h.key}>
                    <rect
                      x={h.x - w / 2}
                      y={h.y - hgt / 2}
                      width={w}
                      height={hgt}
                      fill={placed ? "rgba(250,204,21,0.35)" : "rgba(250,204,21,0.10)"}
                      stroke={placed ? "rgba(250,204,21,1)" : "rgba(250,204,21,0.45)"}
                      strokeWidth={placed ? 2 : 1.5}
                      strokeDasharray={placed ? "0" : "4 3"}
                      rx={4}
                      style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                      data-testid={`hotspot-${h.key}`}
                      onClick={() => onPlace(h.key)}
                    >
                      <title>{`Split ${h.nums.join(" · ")} — 17:1`}</title>
                    </rect>
                    {placed && (
                      <g pointerEvents="none">
                        <circle cx={h.x} cy={h.y} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
                        <text
                          x={h.x}
                          y={h.y}
                          fill="#000"
                          fontSize={9}
                          fontWeight={900}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          ₹{bets[h.key]}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Corner hotspots — small circles at 4-cell intersections */}
              {cornerHotspots.map((h) => {
                const placed = !!bets[h.key];
                return (
                  <g key={h.key}>
                    <circle
                      cx={h.x}
                      cy={h.y}
                      r={14}
                      fill={placed ? "rgba(250,204,21,0.40)" : "rgba(34,211,238,0.15)"}
                      stroke={placed ? "rgba(250,204,21,1)" : "rgba(34,211,238,0.85)"}
                      strokeWidth={placed ? 2 : 1.5}
                      style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                      data-testid={`hotspot-${h.key}`}
                      onClick={() => onPlace(h.key)}
                    >
                      <title>{`Corner ${h.nums.join(" · ")} — 8:1`}</title>
                    </circle>
                    {!placed && (
                      <text
                        x={h.x}
                        y={h.y}
                        fill="rgba(255,255,255,0.9)"
                        fontSize={11}
                        fontWeight={900}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        pointerEvents="none"
                      >
                        +
                      </text>
                    )}
                    {placed && (
                      <g pointerEvents="none">
                        <circle cx={h.x} cy={h.y} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
                        <text
                          x={h.x}
                          y={h.y}
                          fill="#000"
                          fontSize={9}
                          fontWeight={900}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          ₹{bets[h.key]}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
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

        {/* Special Street buttons (0-1-2 and 1-2-3) */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-2 gap-1">
            {outsideBtn("street_0_1_2", "Street 0·1·2 · 11:1", "!bg-emerald-900/40 hover:!bg-emerald-800/50")}
            {outsideBtn("street_1_2_3", "Street 1·2·3 · 11:1", "!bg-emerald-900/40 hover:!bg-emerald-800/50")}
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

        {/* Quick-help legend */}
        <div className="mt-2 text-[10px] text-slate-400 text-center px-2 leading-relaxed">
          Tap a number = <span className="text-yellow-300">Straight 35:1</span> · Tap the
          <span className="mx-1 inline-block w-4 h-1 rounded bg-yellow-400/60 align-middle"></span>
          yellow line between 2 numbers = <span className="text-yellow-300">Split 17:1</span> · Tap the
          <span className="mx-1 inline-block w-2.5 h-2.5 rounded-full bg-cyan-400/40 border border-cyan-300/80 align-middle"></span>
          cyan corner + = <span className="text-yellow-300">Corner 8:1</span>
        </div>
      </div>
    </div>
  );
}
