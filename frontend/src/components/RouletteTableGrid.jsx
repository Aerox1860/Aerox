import { colorOf } from "@/lib/roulette";

/**
 * Vertical European roulette betting board (mobile-first).
 *
 * Layout:
 *   ┌───────────────┐
 *   │       0       │  ← Zero bar spans all 3 columns
 *   ├───┬───┬───────┤
 *   │ 1 │ 2 │  3    │
 *   │ 4 │ 5 │  6    │
 *   ⋮   ⋮   ⋮
 *   │34 │35 │  36   │
 *   └───┴───┴───────┘
 *
 * SVG viewBox: 210 wide × 650 tall.
 *   • Zero bar: y = 0..50   (full width 0..210)
 *   • Grid:     y = 50..650 (12 rows × 50 tall, 3 cols × 70 wide)
 *
 * Interactive hotspots (via SVG overlay with overflow:visible):
 *   • Vertical yellow line between 2 cells in same row  → Split (17:1)
 *   • Horizontal yellow line between 2 cells in same col → Split (17:1)
 *   • Horizontal yellow line at top of "1"/"2"/"3" cell → Split 0-N (17:1)
 *   • Cyan circle at 4-cell intersection                → Corner (8:1)
 *   • Yellow line on RIGHT edge of each row             → Street (11:1)
 *   • Cyan "6" dot on RIGHT edge between 2 rows         → Six-Line (5:1)
 *   • Cyan trio circle at top-corner of "1"/"2"         → Trio 0-1-2 / 0-2-3 (11:1)
 *
 * Props:
 *  - bets: { [betKey]: totalAmount }
 *  - onPlace: (betKey: string) => void
 *  - disabled: boolean
 *  - resultNumber: number | null (for highlight)
 */

// row 0 = [1,2,3], row 1 = [4,5,6], ..., row 11 = [34,35,36]
const VROWS = Array.from({ length: 12 }, (_, r) => [3 * r + 1, 3 * r + 2, 3 * r + 3]);

// Geometry constants in SVG viewBox coordinate units.
const CELL_W = 70;
const CELL_H = 50;
const ZERO_H = 50;
const VIEW_W = CELL_W * 3;              // 210
const VIEW_H = ZERO_H + CELL_H * 12;    // 650
const RIGHT_EDGE_X = VIEW_W + 8;        // hotspots parked just outside right edge

const cellCX = (c) => c * CELL_W + CELL_W / 2;
const cellCY = (r) => ZERO_H + r * CELL_H + CELL_H / 2;

function enumerateSplits() {
  const list = [];
  // In-row (horizontal split, vertical yellow line): (r,c)|(r,c+1) for c in 0..1
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 2; c++) {
      const a = VROWS[r][c], b = VROWS[r][c + 1];
      list.push({
        key: `split_${a}_${b}`, nums: [a, b],
        x: (c + 1) * CELL_W, y: cellCY(r), orient: "v",
      });
    }
  }
  // In-column (vertical split, horizontal yellow line): (r,c)|(r+1,c) for r in 0..10
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 11; r++) {
      const a = VROWS[r][c], b = VROWS[r + 1][c];
      list.push({
        key: `split_${a}_${b}`, nums: [a, b],
        x: cellCX(c), y: ZERO_H + (r + 1) * CELL_H, orient: "h",
      });
    }
  }
  // 0-splits: between zero bar and each first-row cell (1, 2, 3)
  for (let c = 0; c < 3; c++) {
    const num = VROWS[0][c];
    list.push({
      key: `split_0_${num}`, nums: [0, num],
      x: cellCX(c), y: ZERO_H, orient: "h",
    });
  }
  return list;
}

function enumerateCorners() {
  const list = [];
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 2; c++) {
      const nums = [
        VROWS[r][c], VROWS[r][c + 1],
        VROWS[r + 1][c], VROWS[r + 1][c + 1],
      ].sort((a, b) => a - b);
      list.push({
        key: `corner_${nums.join("_")}`, nums,
        x: (c + 1) * CELL_W,
        y: ZERO_H + (r + 1) * CELL_H,
      });
    }
  }
  return list;
}

function enumerateStreets() {
  const list = [];
  for (let r = 0; r < 12; r++) {
    const nums = [...VROWS[r]];
    list.push({
      key: `street_${nums.join("_")}`, nums,
      x: RIGHT_EDGE_X, y: cellCY(r), kind: "street",
    });
  }
  // Trios: 0-1-2 at corner between "1" (col 0) and "2" (col 1) on the top edge
  //        0-2-3 at corner between "2" (col 1) and "3" (col 2) on the top edge
  list.push({
    key: "street_0_1_2", nums: [0, 1, 2],
    x: CELL_W, y: ZERO_H, kind: "trio", label: "012",
  });
  list.push({
    key: "street_0_2_3", nums: [0, 2, 3],
    x: 2 * CELL_W, y: ZERO_H, kind: "trio", label: "023",
  });
  return list;
}

function enumerateSixLines() {
  const list = [];
  for (let r = 0; r < 11; r++) {
    const nums = [...VROWS[r], ...VROWS[r + 1]];
    list.push({
      key: `six_line_${nums.join("_")}`, nums,
      x: RIGHT_EDGE_X, y: ZERO_H + (r + 1) * CELL_H,
    });
  }
  return list;
}

export default function RouletteTableGrid({
  bets = {},
  onPlace,
  disabled = false,
  resultNumber = null,
}) {
  const splits = enumerateSplits();
  const corners = enumerateCorners();
  const streets = enumerateStreets();
  const sixLines = enumerateSixLines();

  // Circular chip overlay for on-cell bets (straight, red, black, ...).
  const ChipBadge = ({ betKey }) => {
    const v = bets[betKey];
    if (!v) return null;
    return (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        data-testid={`bet-chip-${betKey}`}
      >
        <div className="min-w-[26px] h-[22px] px-1.5 rounded-full bg-yellow-400 text-black text-[10px] font-black grid place-items-center border-2 border-yellow-700 shadow-[0_2px_5px_rgba(0,0,0,0.6)]">
          ₹{v}
        </div>
      </div>
    );
  };

  return (
    <div
      className="mx-auto w-full max-w-[240px] md:max-w-[280px]"
      data-testid="roulette-betting-table"
    >
      <div
        className="relative rounded-lg border-2 border-yellow-500/40 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        style={{
          background:
            "radial-gradient(circle at 50% 20%, #0e6e3a 0%, #093f22 70%, #052213 100%)",
        }}
      >
        {/* Zero bar */}
        <button
          type="button"
          onClick={() => !disabled && onPlace("straight_0")}
          data-testid="bet-straight-0"
          className={`relative w-full aspect-[210/50] bg-emerald-600 border-b-2 border-yellow-500/40 grid place-items-center transition-all hover:brightness-110 active:scale-[0.99] ${
            disabled ? "pointer-events-none" : ""
          } ${resultNumber === 0 ? "ring-2 ring-yellow-300" : ""}`}
        >
          <span className="text-white font-heading font-black text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
            0
          </span>
          <ChipBadge betKey="straight_0" />
        </button>

        {/* Number grid: 12 rows × 3 cols */}
        <div className="grid grid-cols-3 relative">
          {VROWS.flat().map((n) => {
            const c = colorOf(n);
            const bg =
              c === "red"
                ? "bg-red-600"
                : c === "black"
                ? "bg-neutral-900"
                : "bg-emerald-600";
            const highlight = resultNumber === n ? "ring-2 ring-yellow-300 z-10" : "";
            return (
              <button
                key={`n-${n}`}
                type="button"
                onClick={() => !disabled && onPlace(`straight_${n}`)}
                data-testid={`bet-straight-${n}`}
                className={`relative aspect-[7/5] border border-white/60 grid place-items-center ${bg} ${highlight} transition-all active:brightness-125 ${
                  disabled ? "pointer-events-none" : ""
                }`}
              >
                <span className="text-white font-heading font-black text-base md:text-lg drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                  {n}
                </span>
                <ChipBadge betKey={`straight_${n}`} />
              </button>
            );
          })}
        </div>

        {/* SVG hotspot overlay — spans full table (zero bar + grid).
            overflow:visible allows street/six-line hotspots to extend past the right edge. */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none", overflow: "visible" }}
        >
          {/* Splits — thin yellow lines between adjacent cells */}
          {splits.map((h) => {
            const isVert = h.orient === "v";
            const x1 = isVert ? h.x : h.x - CELL_W * 0.4;
            const x2 = isVert ? h.x : h.x + CELL_W * 0.4;
            const y1 = isVert ? h.y - CELL_H * 0.4 : h.y;
            const y2 = isVert ? h.y + CELL_H * 0.4 : h.y;
            const placed = !!bets[h.key];
            return (
              <g key={h.key}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="transparent" strokeWidth={18} strokeLinecap="round"
                  style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                  data-testid={`hotspot-${h.key}`}
                  onClick={() => onPlace(h.key)}
                >
                  <title>{`Split ${h.nums.join(" · ")} — 17:1`}</title>
                </line>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={placed ? "#facc15" : "rgba(250,204,21,0.85)"}
                  strokeWidth={placed ? 3.5 : 2.5}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {placed && (
                  <ChipDot cx={h.x} cy={h.y} amount={bets[h.key]} />
                )}
              </g>
            );
          })}

          {/* Corners — cyan dots at 4-cell intersections */}
          {corners.map((h) => {
            const placed = !!bets[h.key];
            return (
              <g key={h.key}>
                <circle
                  cx={h.x} cy={h.y} r={11}
                  fill={placed ? "rgba(250,204,21,0.4)" : "rgba(34,211,238,0.15)"}
                  stroke={placed ? "rgba(250,204,21,1)" : "rgba(34,211,238,0.9)"}
                  strokeWidth={placed ? 2 : 1.5}
                  style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                  data-testid={`hotspot-${h.key}`}
                  onClick={() => onPlace(h.key)}
                >
                  <title>{`Corner ${h.nums.join(" · ")} — 8:1`}</title>
                </circle>
                {!placed && (
                  <text
                    x={h.x} y={h.y}
                    fill="rgba(255,255,255,0.9)" fontSize={9} fontWeight={900}
                    textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                  >+</text>
                )}
                {placed && <ChipDot cx={h.x} cy={h.y} amount={bets[h.key]} />}
              </g>
            );
          })}

          {/* Streets and trios */}
          {streets.map((h) => {
            const placed = !!bets[h.key];
            if (h.kind === "trio") {
              return (
                <g key={h.key}>
                  <circle
                    cx={h.x} cy={h.y} r={13}
                    fill={placed ? "rgba(250,204,21,0.4)" : "rgba(34,211,238,0.18)"}
                    stroke={placed ? "rgba(250,204,21,1)" : "rgba(34,211,238,0.9)"}
                    strokeWidth={placed ? 2 : 1.5}
                    style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                    data-testid={`hotspot-${h.key}`}
                    onClick={() => onPlace(h.key)}
                  >
                    <title>{`Trio ${h.nums.join(" · ")} — 11:1`}</title>
                  </circle>
                  {!placed && (
                    <text
                      x={h.x} y={h.y}
                      fill="rgba(255,255,255,0.95)" fontSize={9} fontWeight={900}
                      textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                    >{h.label}</text>
                  )}
                  {placed && <ChipDot cx={h.x} cy={h.y} amount={bets[h.key]} />}
                </g>
              );
            }
            // Regular row-street: yellow line on right outer edge
            return (
              <g key={h.key}>
                <line
                  x1={h.x} y1={h.y - CELL_H * 0.4} x2={h.x} y2={h.y + CELL_H * 0.4}
                  stroke="transparent" strokeWidth={20} strokeLinecap="round"
                  style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                  data-testid={`hotspot-${h.key}`}
                  onClick={() => onPlace(h.key)}
                >
                  <title>{`Street ${h.nums.join(" · ")} — 11:1`}</title>
                </line>
                <line
                  x1={h.x} y1={h.y - CELL_H * 0.4} x2={h.x} y2={h.y + CELL_H * 0.4}
                  stroke={placed ? "#facc15" : "rgba(250,204,21,0.85)"}
                  strokeWidth={placed ? 4 : 3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {placed && <ChipDot cx={h.x} cy={h.y} amount={bets[h.key]} />}
              </g>
            );
          })}

          {/* Six-lines — cyan "6" dots on the RIGHT edge between two rows */}
          {sixLines.map((h) => {
            const placed = !!bets[h.key];
            return (
              <g key={h.key}>
                <circle
                  cx={h.x} cy={h.y} r={11}
                  fill={placed ? "rgba(250,204,21,0.4)" : "rgba(34,211,238,0.15)"}
                  stroke={placed ? "rgba(250,204,21,1)" : "rgba(34,211,238,0.85)"}
                  strokeWidth={placed ? 2 : 1.5}
                  style={{ pointerEvents: disabled ? "none" : "auto", cursor: "pointer" }}
                  data-testid={`hotspot-${h.key}`}
                  onClick={() => onPlace(h.key)}
                >
                  <title>{`Six-Line ${h.nums.join(" · ")} — 5:1`}</title>
                </circle>
                {!placed && (
                  <text
                    x={h.x} y={h.y}
                    fill="rgba(255,255,255,0.9)" fontSize={8} fontWeight={900}
                    textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                  >6</text>
                )}
                {placed && <ChipDot cx={h.x} cy={h.y} amount={bets[h.key]} />}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Small yellow "placed" chip badge rendered inside the SVG for hotspot bets.
function ChipDot({ cx, cy, amount }) {
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={11} fill="#facc15" stroke="#854d0e" strokeWidth={2} />
      <text
        x={cx} y={cy}
        fill="#000" fontSize={8} fontWeight={900}
        textAnchor="middle" dominantBaseline="middle"
      >₹{amount}</text>
    </g>
  );
}
