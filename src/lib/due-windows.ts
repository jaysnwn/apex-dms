import { addDays } from "@/lib/gst";

// "When is it due" windows for the Outstanding page, in India dates
// (YYYY-MM-DD). A week runs Monday to Sunday; "this week" and "this month"
// cover today up to the end of the week / month, so they never include bills
// that are already overdue (those are under Overdue).
export type DueKey = "overdue" | "today" | "week" | "month";
export const DUE_KEYS: DueKey[] = ["overdue", "today", "week", "month"];

export function dueWindows(today: string) {
  const d = new Date(today + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;                    // Monday = 0 … Sunday = 6
  const weekEnd = addDays(today, 6 - dow);
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return {
    today, weekEnd, monthEnd,
    test: {
      overdue: (due: string) => due < today,
      today: (due: string) => due === today,
      week: (due: string) => due >= today && due <= weekEnd,
      month: (due: string) => due >= today && due <= monthEnd,
    } satisfies Record<DueKey, (due: string) => boolean>,
  };
}
