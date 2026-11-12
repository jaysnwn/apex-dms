// Step timings for server work. Writes one log line (label, total ms, ms at
// each step; never data) on preview deployments, and in production when the
// work took longer than SLOW_MS, so slow saves show up in the hosting's logs.
const SLOW_MS = 1500;

// Set by the middleware: when the request arrived (ms since epoch).
export const REQUEST_START_HEADER = "x-dms-t0";

// requestStart: the REQUEST_START_HEADER value, to also log how long after the
// request arrived this work began (shows time spent before it, e.g. waiting on
// a cache purge after a save).
export function stopwatch(label: string, requestStart?: string | null) {
  const t0 = performance.now();
  const startedAt = Date.now();
  const arrived = Number(requestStart);
  const waited = Number.isFinite(arrived) && arrived > 0 ? startedAt - arrived : null;
  const marks: [string, number][] = [];
  return {
    mark(step: string) {
      marks.push([step, Math.round(performance.now() - t0)]);
    },
    done() {
      const total = Math.round(performance.now() - t0);
      const slow = total > SLOW_MS || (waited ?? 0) > SLOW_MS;
      if (slow || process.env.VERCEL_ENV === "preview") {
        console.log(JSON.stringify({ level: slow ? "warning" : "info", timing: label, total, sinceRequest: waited, marks }));
      }
    },
  };
}
