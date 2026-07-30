// Roulette game constants — mirrors backend engine
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_SET = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function colorOf(n) {
  if (n === 0) return "green";
  return RED_SET.has(n) ? "red" : "black";
}

// Standard European table grid (rows visually top → bottom, 12 cols).
export const TABLE_GRID = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], // top row
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], // middle row
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], // bottom row
];

// --- Allowed multi-number bets (mirror of backend rules) ---
function buildAllowedSplits() {
  const s = new Set(["0-1", "0-2", "0-3"]);
  for (let k = 1; k <= 12; k++) {
    const col = [3 * k - 2, 3 * k - 1, 3 * k];
    s.add(`${col[0]}-${col[1]}`);
    s.add(`${col[1]}-${col[2]}`);
  }
  for (let k = 1; k <= 11; k++) {
    s.add(`${3 * k - 2}-${3 * (k + 1) - 2}`);
    s.add(`${3 * k - 1}-${3 * (k + 1) - 1}`);
    s.add(`${3 * k}-${3 * (k + 1)}`);
  }
  return s;
}
export const ALLOWED_SPLITS = buildAllowedSplits();

function buildAllowedCorners() {
  const s = new Set();
  for (let k = 1; k <= 11; k++) {
    s.add([3 * k - 2, 3 * k - 1, 3 * (k + 1) - 2, 3 * (k + 1) - 1].sort((a, b) => a - b).join("-"));
    s.add([3 * k - 1, 3 * k, 3 * (k + 1) - 1, 3 * (k + 1)].sort((a, b) => a - b).join("-"));
  }
  return s;
}
export const ALLOWED_CORNERS = buildAllowedCorners();

function buildAllowedStreets() {
  const s = new Set(["0-1-2", "0-2-3"]);
  for (let k = 1; k <= 12; k++) {
    s.add([3 * k - 2, 3 * k - 1, 3 * k].join("-"));
  }
  return s;
}
export const ALLOWED_STREETS = buildAllowedStreets();

function buildAllowedSixLines() {
  const s = new Set();
  for (let k = 1; k <= 11; k++) {
    s.add([
      3 * k - 2, 3 * k - 1, 3 * k,
      3 * (k + 1) - 2, 3 * (k + 1) - 1, 3 * (k + 1),
    ].join("-"));
  }
  return s;
}
export const ALLOWED_SIX_LINES = buildAllowedSixLines();

/**
 * Enumerate all clickable split hotspots as {a, b, x, y}.
 * The grid inner area uses SVG viewBox coordinates:
 *   • 12 columns × 3 rows of 100×100 unit cells, top-left = (0,0), bottom-right = (1200,300).
 *   • Number layout: row-top = 3k (y = 0-100), row-mid = 3k-1 (y = 100-200), row-bot = 3k-2 (y = 200-300),
 *     for column k=1..12 (x = (k-1)*100 to k*100).
 * Also enumerates the 3 special "0-splits" as x-negative left of column 1.
 */
export function enumerateSplitHotspots() {
  const list = [];
  // Vertical splits (within one column of 3 cells) — hotspot straddles horizontal border between rows
  for (let k = 1; k <= 12; k++) {
    const cx = (k - 1) * 100 + 50;
    // between row-top (3k) and row-mid (3k-1): y = 100
    list.push({ key: `split_${3 * k - 1}_${3 * k}`, nums: [3 * k - 1, 3 * k], x: cx, y: 100 });
    // between row-mid (3k-1) and row-bot (3k-2): y = 200
    list.push({ key: `split_${3 * k - 2}_${3 * k - 1}`, nums: [3 * k - 2, 3 * k - 1], x: cx, y: 200 });
  }
  // Horizontal splits (between adjacent columns) — hotspot straddles vertical border
  for (let k = 1; k <= 11; k++) {
    const cx = k * 100;
    list.push({ key: `split_${3 * k - 2}_${3 * (k + 1) - 2}`, nums: [3 * k - 2, 3 * (k + 1) - 2], x: cx, y: 250 });
    list.push({ key: `split_${3 * k - 1}_${3 * (k + 1) - 1}`, nums: [3 * k - 1, 3 * (k + 1) - 1], x: cx, y: 150 });
    list.push({ key: `split_${3 * k}_${3 * (k + 1)}`, nums: [3 * k, 3 * (k + 1)], x: cx, y: 50 });
  }
  return list;
}

/**
 * Enumerate corner hotspots at the intersection of 4 adjacent cells.
 * Corner center = (col boundary, row boundary) in viewBox units.
 */
export function enumerateCornerHotspots() {
  const list = [];
  for (let k = 1; k <= 11; k++) {
    const cx = k * 100;
    // Corner among row-bot(k), row-mid(k), row-bot(k+1), row-mid(k+1) — center y = 200
    list.push({
      key: `corner_${3 * k - 2}_${3 * k - 1}_${3 * (k + 1) - 2}_${3 * (k + 1) - 1}`,
      nums: [3 * k - 2, 3 * k - 1, 3 * (k + 1) - 2, 3 * (k + 1) - 1].sort((a, b) => a - b),
      x: cx,
      y: 200,
    });
    // Corner among row-mid, row-top of both columns — center y = 100
    list.push({
      key: `corner_${3 * k - 1}_${3 * k}_${3 * (k + 1) - 1}_${3 * (k + 1)}`,
      nums: [3 * k - 1, 3 * k, 3 * (k + 1) - 1, 3 * (k + 1)].sort((a, b) => a - b),
      x: cx,
      y: 100,
    });
  }
  return list;
}


export function isSplitAllowed(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return ALLOWED_SPLITS.has(`${x}-${y}`);
}

export function isCornerAllowed(nums) {
  if (nums.length !== 4) return false;
  const key = [...nums].sort((a, b) => a - b).join("-");
  return ALLOWED_CORNERS.has(key);
}

/**
 * All 12 street hotspots — 3-number bets on each column.
 * Rendered as short horizontal lines at the BOTTOM outer edge of the number grid
 * (y just below the viewBox — SVG must have overflow:visible).
 * Column k=1..12: street = (3k-2, 3k-1, 3k) — hotspot at (x = (k-1)*100 + 50, y = 316).
 */
export function enumerateStreetHotspots() {
  const list = [];
  for (let k = 1; k <= 12; k++) {
    const nums = [3 * k - 2, 3 * k - 1, 3 * k];
    list.push({
      key: `street_${nums.join("_")}`,
      nums,
      x: (k - 1) * 100 + 50,
      y: 316,
    });
  }
  return list;
}

/**
 * 11 six-line hotspots — 6-number bets spanning two adjacent columns.
 * Rendered as short horizontal lines at the BOTTOM outer edge on the boundary
 * between columns k and k+1 (x = k*100, y = 316).
 */
export function enumerateSixLineHotspots() {
  const list = [];
  for (let k = 1; k <= 11; k++) {
    const nums = [
      3 * k - 2, 3 * k - 1, 3 * k,
      3 * (k + 1) - 2, 3 * (k + 1) - 1, 3 * (k + 1),
    ];
    list.push({
      key: `six_line_${nums.join("_")}`,
      nums,
      x: k * 100,
      y: 316,
    });
  }
  return list;
}

export const CHIP_VALUES = [10, 50, 100, 500, 1000];

export const BET_LABELS = {
  red: "Red",
  black: "Black",
  even: "Even",
  odd: "Odd",
  low: "1–18",
  high: "19–36",
  dozen_1: "1st 12",
  dozen_2: "2nd 12",
  dozen_3: "3rd 12",
  column_1: "1st Column",
  column_2: "2nd Column",
  column_3: "3rd Column",
};

export const PAYOUT_LABEL = {
  straight: "35:1",
  split: "17:1",
  street: "11:1",
  corner: "8:1",
  six_line: "5:1",
  red: "1:1",
  black: "1:1",
  even: "1:1",
  odd: "1:1",
  low: "1:1",
  high: "1:1",
  dozen_1: "3:1",
  dozen_2: "3:1",
  dozen_3: "3:1",
};

// Profit multiplier (mirror of backend)
export function profitMultClient(bt) {
  if (bt.startsWith("straight_")) return 35;
  if (bt.startsWith("split_")) return 17;
  if (bt.startsWith("street_")) return 11;
  if (bt.startsWith("corner_")) return 8;
  if (bt.startsWith("six_line_")) return 5;
  if (bt.startsWith("dozen_")) return 3;
  if (bt.startsWith("column_")) return 2;
  return 1;
}

// Winner detection (mirror of backend)
export function isWinnerClient(bt, num) {
  if (bt.startsWith("straight_")) return parseInt(bt.split("_")[1], 10) === num;
  if (bt.startsWith("split_") || bt.startsWith("street_") || bt.startsWith("corner_")) {
    return bt.split("_").slice(1).map(Number).includes(num);
  }
  if (bt.startsWith("six_line_")) {
    return bt.split("_").slice(2).map(Number).includes(num);
  }
  if (num === 0) return false;
  if (bt === "red") return colorOf(num) === "red";
  if (bt === "black") return colorOf(num) === "black";
  if (bt === "even") return num % 2 === 0;
  if (bt === "odd") return num % 2 === 1;
  if (bt === "low") return num >= 1 && num <= 18;
  if (bt === "high") return num >= 19 && num <= 36;
  if (bt === "dozen_1") return num >= 1 && num <= 12;
  if (bt === "dozen_2") return num >= 13 && num <= 24;
  if (bt === "dozen_3") return num >= 25 && num <= 36;
  if (bt === "column_1") return num % 3 === 1;
  if (bt === "column_2") return num % 3 === 2;
  if (bt === "column_3") return num !== 0 && num % 3 === 0;
  return false;
}

// Human label for a bet key (used in bet history + winners ticker)
export function labelForBet(bt) {
  if (bt.startsWith("straight_")) return `#${bt.split("_")[1]}`;
  if (bt.startsWith("split_")) return `Split ${bt.split("_").slice(1).join("·")}`;
  if (bt.startsWith("street_")) return `Street ${bt.split("_").slice(1).join("·")}`;
  if (bt.startsWith("corner_")) return `Corner ${bt.split("_").slice(1).join("·")}`;
  if (bt.startsWith("six_line_")) return `Line ${bt.split("_").slice(2).join("·")}`;
  return BET_LABELS[bt] || bt;
}

