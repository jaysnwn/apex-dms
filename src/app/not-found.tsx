import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-slate-400">404</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">This page does not exist</h1>
        <p className="mt-2 text-sm text-slate-600">The link may be old, or the record belongs to another organization.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Go to start</Link>
      </div>
    </main>
  );
}
