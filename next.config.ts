import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating "N" dev badge; it sat on top of the sidebar's sign-out button.
  devIndicators: false,
  // PDF rendering runs on the server in Node; keep the library out of the bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // pdfkit loads its built-in fonts (Helvetica…) through "#standard-fonts/*"
  // package imports, which the deployment file tracer does not follow: without
  // this, every PDF (invoice, receipt, statement, share) failed on Vercel with
  // "Cannot find module …/standard-fonts/Helvetica.cjs". PDFs are also made by
  // share buttons (server actions) on many pages, hence every route.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfkit/js/standard-fonts/**/*.cjs"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // Excel imports
  },
};

export default nextConfig;
