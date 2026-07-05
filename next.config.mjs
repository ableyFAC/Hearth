/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` and `next build` corrupt each other when they share .next
  // (missing vendor chunks, prerender failures). Setting NEXT_DIST_DIR lets a
  // verification build write somewhere else while the dev server keeps
  // running. Hosted builds (e.g. Vercel) never set it, so they use .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Supabase Storage public buckets serve images from your project domain.
    // Add your project ref host here once you create the bucket.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Baseline security headers on every response. HSTS forces HTTPS, the frame
  // headers stop clickjacking, nosniff stops MIME confusion, and the referrer
  // policy keeps our URLs (which can contain ids) out of third-party referers.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
