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

// Standard European table grid (columns visually, 3 rows × 12 cols).
// Bottom row = column 1, top row = column 3.
export const TABLE_GRID = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], // top row
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], // middle row
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], // bottom row
];

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
};

export const PAYOUT_LABEL = {
  straight: "35:1",
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
