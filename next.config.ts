import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Cursor's local preview uses 127.0.0.1 and a forwarded *.agent.cvm.dev host.
  // Next.js blocks those in development, which leaves the planner as static HTML.
  allowedDevOrigins: ["127.0.0.1", "*.agent.cvm.dev", "*.trycloudflare.com"],
  // The old GoHighLevel site's pages. Everything else there was a single page.
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms-of-services", destination: "/privacy", permanent: true },
      { source: "/terms-of-service", destination: "/privacy", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
