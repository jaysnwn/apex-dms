// Step timings for server work. Writes one log line (label, total ms, ms at
// each step; never data) on preview deployments, and in production when the
// work took longer than SLOW_MS, so slow saves show up in the hosting's logs.
const SLOW_MS = 1500;

export function stopwatch(label: string) {
  const t0 = performance.now();
  const marks: [string, number][] = [];
  return {
    mark(step: string) {
      marks.push([step, Math.round(performance.now() - t0)]);
    },
    done() {
      const total = Math.round(performance.now() - t0);
      if (total > SLOW_MS || process.env.VERCEL_ENV === "preview") {
        console.log(JSON.stringify({ level: total > SLOW_MS ? "warning" : "info", timing: label, total, marks }));
      }
    },
  };
}
