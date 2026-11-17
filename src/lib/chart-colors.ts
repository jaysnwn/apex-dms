// Chart series colours, usable from server and browser code alike.
// (Kept out of components/charts.tsx: values exported from a "use client" file
// are only placeholders on the server.) They are theme variables, so charts follow
// light and dark mode; fixed order, never cycled.
export const SERIES = [
  "var(--blue-600)",
  "var(--teal-600)",
  "var(--violet-600)",
  "var(--amber-600)",
  "var(--green-600)",
  "var(--red-600)",
  "var(--neutral-500)",
  "var(--blue-400)",
];
