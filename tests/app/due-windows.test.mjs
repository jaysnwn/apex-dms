// Due windows on the Outstanding page (Monday–Sunday weeks, India dates).
import assert from "node:assert/strict";
const { dueWindows } = await import("./build/due-windows.mjs");

const ok = (name, fn) => { fn(); console.log("ok  " + name); };

ok("Tuesday 17 Nov: week ends Sunday 22 Nov, month ends 30 Nov", () => {
  const w = dueWindows("2026-11-17");
  assert.equal(w.weekEnd, "2026-11-22");
  assert.equal(w.monthEnd, "2026-11-30");
});
ok("Sunday: the week ends today", () => assert.equal(dueWindows("2026-11-22").weekEnd, "2026-11-22"));
ok("Monday: the week ends on the coming Sunday", () => assert.equal(dueWindows("2026-11-23").weekEnd, "2026-11-29"));
ok("February in a leap year ends on the 29th", () => assert.equal(dueWindows("2028-02-10").monthEnd, "2028-02-29"));
ok("31 Dec: week and month windows cross the year correctly", () => {
  const w = dueWindows("2026-12-31");
  assert.equal(w.weekEnd, "2027-01-03");
  assert.equal(w.monthEnd, "2026-12-31");
});
ok("overdue / today / week / month tests", () => {
  const { test } = dueWindows("2026-11-17");
  assert.equal(test.overdue("2026-11-16"), true);
  assert.equal(test.overdue("2026-11-17"), false);
  assert.equal(test.today("2026-11-17"), true);
  assert.equal(test.week("2026-11-22"), true);
  assert.equal(test.week("2026-11-23"), false);
  assert.equal(test.week("2026-11-16"), false);
  assert.equal(test.month("2026-11-30"), true);
  assert.equal(test.month("2026-12-01"), false);
});
