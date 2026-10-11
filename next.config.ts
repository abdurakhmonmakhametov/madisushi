import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The git root is the user's home directory; keep Turbopack scoped here.
  turbopack: { root: path.resolve(".") },
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // dev only: open the dev server through an https tunnel (Telegram Mini App testing)
  allowedDevOrigins: ["*.trycloudflare.com"],
  // image uploads are limited to 2 MB in src/lib/integrations/storage.ts
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  images: { dangerouslyAllowSVG: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Framing is allowed only for Telegram (Mini App on web.telegram.org runs in an iframe).
          // X-Frame-Options can't allow-list origins, so CSP frame-ancestors replaces it.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" },
        ],
      },
    ];
  },
};

export default nextConfig;
