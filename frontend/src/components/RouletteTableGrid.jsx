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
    const ovalBg =
      c === "green"
        ? "bg-emerald-600"
        : c === "red"
        ? "bg-red-600"
        : "bg-neutral-900";
    const winHighlight = resultNumber === n ? "ring-2 ring-yellow-300" : "";
    return (
      <button
        key={`n-${n}`}
        onClick={() => !disabled && onPlace(`straight_${n}`)}
        data-testid={`bet-straight-${n}`}
        className={`relative aspect-[3/2] border border-white/70 grid place-items-center transition-all bg-emerald-800/40 hover:bg-emerald-700/50 ${disabled ? "pointer-events-none" : ""}`}
      >
        <span
          className={`inline-flex items-center justify-center w-[70%] aspect-square rounded-full ${ovalBg} ${winHighlight} text-white font-heading font-black text-sm md:text-base shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.2)]`}
        >
          {n}
        </span>
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
          {/* Zero (spans 3 rows on the left) — big vertical "0" oval on a green cell */}
          <button
            onClick={() => !disabled && onPlace("straight_0")}
            data-testid="bet-straight-0"
            className={`relative aspect-[1/3] w-[38px] md:w-[46px] bg-emerald-800/40 border border-white/70 grid place-items-center transition-all hover:bg-emerald-700/50 ${disabled ? "pointer-events-none" : ""}`}
          >
            <span
              className={`inline-flex items-center justify-center w-[70%] aspect-[1/2] rounded-full bg-emerald-600 text-white font-heading font-black text-xl shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.2)] ${
                resultNumber === 0 ? "ring-2 ring-yellow-300" : ""
              }`}
            >
              0
            </span>
            {chipOverlay("straight_0")}
          </button>

          {/* 3×12 grid with hotspot SVG overlay */}
          <div className="relative flex-1">
            <div className="grid grid-cols-12 gap-0">
              {TABLE_GRID.flat().map((n) => numCell(n))}
            </div>

            {/* SVG hotspot overlay — click BETWEEN cells for splits & corners.
                overflow:visible lets hotspots on the LEFT edge (0-cell splits) and BOTTOM edge
                (street 1-2-3) extend beyond the SVG viewBox into the seam. */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 1200 300"
              preserveAspectRatio="none"
              style={{ pointerEvents: "none", overflow: "visible" }}
            >
              {/* 0-CELL adjacency hotspots (rendered here so they overlap the seam
                  between the "0" button and the number grid) */}
              {(() => {
                // Split between 0 and each of 1, 2, 3 — vertical yellow line at grid's left edge.
                const zeroSplits = [
                  { key: "split_0_1", nums: [0, 1], y: 250 }, // bottom row ("1")
                  { key: "split_0_2", nums: [0, 2], y: 150 }, // middle row ("2")
                  { key: "split_0_3", nums: [0, 3], y: 50  }, // top row ("3")
                ];
                return zeroSplits.map((h) => {
                  const placed = !!bets[h.key];
                  return (
                    <g key={h.key}>
                      {/* Fat invisible hit line, extends into the seam gap */}
                      <line
                        x1={-4} y1={h.y - 30} x2={-4} y2={h.y + 30}
                        stroke="transparent"
                        strokeWidth={22}
                        strokeLinecap="round"
                        style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                        data-testid={`hotspot-${h.key}`}
                        onClick={() => onPlace(h.key)}
                      >
                        <title>{`Split ${h.nums.join(" · ")} — 17:1`}</title>
                      </line>
                      {/* Visible thin yellow line */}
                      <line
                        x1={-4} y1={h.y - 30} x2={-4} y2={h.y + 30}
                        stroke={placed ? "#facc15" : "rgba(250,204,21,0.85)"}
                        strokeWidth={placed ? 4 : 2.5}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      {placed && (
                        <g pointerEvents="none">
                          <circle cx={-4} cy={h.y} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
                          <text
                            x={-4} y={h.y}
                            fill="#000" fontSize={9} fontWeight={900}
                            textAnchor="middle" dominantBaseline="middle"
                          >₹{bets[h.key]}</text>
                        </g>
                      )}
                    </g>
                  );
                });
              })()}

              {/* Trio 0-1-2 hotspot: cyan circle at corner where 0 / "1" / "2" meet
                  (top-left corner of "1" cell, which is bottom-left of the number grid). */}
              {(() => {
                const key = "street_0_1_2";
                const placed = !!bets[key];
                const cx = -4, cy = 200;
                return (
                  <g key={key}>
                    <circle
                      cx={cx} cy={cy} r={16}
                      fill={placed ? "rgba(250,204,21,0.40)" : "rgba(34,211,238,0.18)"}
                      stroke={placed ? "rgba(250,204,21,1)" : "rgba(34,211,238,0.9)"}
                      strokeWidth={placed ? 2 : 1.8}
                      style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                      data-testid={`hotspot-${key}`}
                      onClick={() => onPlace(key)}
                    >
                      <title>Trio 0·1·2 — 11:1</title>
                    </circle>
                    {!placed && (
                      <text
                        x={cx} y={cy}
                        fill="rgba(255,255,255,0.95)" fontSize={11} fontWeight={900}
                        textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                      >012</text>
                    )}
                    {placed && (
                      <g pointerEvents="none">
                        <circle cx={cx} cy={cy} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
                        <text
                          x={cx} y={cy}
                          fill="#000" fontSize={9} fontWeight={900}
                          textAnchor="middle" dominantBaseline="middle"
                        >₹{bets[key]}</text>
                      </g>
                    )}
                  </g>
                );
              })()}

              {/* Street 1-2-3 hotspot: horizontal yellow line just BELOW the "1" cell
                  (outer bottom edge of the leftmost column). */}
              {(() => {
                const key = "street_1_2_3";
                const placed = !!bets[key];
                const cx = 50, cy = 316;
                return (
                  <g key={key}>
                    <line
                      x1={10} y1={cy} x2={90} y2={cy}
                      stroke="transparent" strokeWidth={26} strokeLinecap="round"
                      style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                      data-testid={`hotspot-${key}`}
                      onClick={() => onPlace(key)}
                    >
                      <title>Street 1·2·3 — 11:1</title>
                    </line>
                    <line
                      x1={10} y1={cy} x2={90} y2={cy}
                      stroke={placed ? "#facc15" : "rgba(250,204,21,0.85)"}
                      strokeWidth={placed ? 4 : 3}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                    {placed && (
                      <g pointerEvents="none">
                        <circle cx={cx} cy={cy} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
                        <text
                          x={cx} y={cy}
                          fill="#000" fontSize={9} fontWeight={900}
                          textAnchor="middle" dominantBaseline="middle"
                        >₹{bets[key]}</text>
                      </g>
                    )}
                  </g>
                );
              })()}
              {/* Split hotspots — a single thin YELLOW line running along the shared edge
                  between two adjacent cells. A wider invisible line underneath keeps the click
                  target easy to hit. */}
              {splitHotspots.map((h) => {
                const isHorizontalSplit = h.y === 50 || h.y === 150 || h.y === 250;
                // Visible line endpoints
                let x1, y1, x2, y2;
                if (isHorizontalSplit) {
                  // Vertical line between two columns — spans one cell's height
                  x1 = h.x; x2 = h.x;
                  y1 = h.y - 40; y2 = h.y + 40;
                } else {
                  // Horizontal line between two rows in the same column — spans cell width
                  x1 = h.x - 40; x2 = h.x + 40;
                  y1 = h.y; y2 = h.y;
                }
                const placed = !!bets[h.key];
                return (
                  <g key={h.key}>
                    {/* Invisible hit area (fat transparent line) */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth={22}
                      strokeLinecap="round"
                      style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                      data-testid={`hotspot-${h.key}`}
                      onClick={() => onPlace(h.key)}
                    >
                      <title>{`Split ${h.nums.join(" · ")} — 17:1`}</title>
                    </line>
                    {/* Visible thin yellow line */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={placed ? "#facc15" : "rgba(250,204,21,0.85)"}
                      strokeWidth={placed ? 4 : 2.5}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
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

        {/* Even chances row */}
        <div className="mt-1 flex gap-1">
          <div className="w-[38px] md:w-[46px]" />
          <div className="flex-1 grid grid-cols-6 gap-1">
            {outsideBtn("low", "1–18")}
            {outsideBtn("even", "EVEN")}
            <button
              onClick={() => !disabled && onPlace("red")}
              data-testid="bet-red"
              className={`relative py-3 md:py-4 border border-white/25 grid place-items-center text-white font-heading font-bold text-xs md:text-sm bg-emerald-800/40 hover:bg-emerald-700/50 transition-all ${disabled ? "pointer-events-none" : ""}`}
            >
              <span className="inline-block w-6 h-6 md:w-7 md:h-7 bg-red-600 rotate-45 border border-white/30 shadow-[0_2px_3px_rgba(0,0,0,0.4)]"></span>
              {chipOverlay("red")}
            </button>
            <button
              onClick={() => !disabled && onPlace("black")}
              data-testid="bet-black"
              className={`relative py-3 md:py-4 border border-white/25 grid place-items-center text-white font-heading font-bold text-xs md:text-sm bg-emerald-800/40 hover:bg-emerald-700/50 transition-all ${disabled ? "pointer-events-none" : ""}`}
            >
              <span className="inline-block w-6 h-6 md:w-7 md:h-7 bg-neutral-900 rotate-45 border border-white/30 shadow-[0_2px_3px_rgba(0,0,0,0.4)]"></span>
              {chipOverlay("black")}
            </button>
            {outsideBtn("odd", "ODD")}
            {outsideBtn("high", "19–36")}
          </div>
        </div>
      </div>
    </div>
  );
}
