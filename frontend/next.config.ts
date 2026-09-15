import type { NextConfig } from "next";

const publicOrigins = [process.env.APP_URL!, process.env.REACT_APP_BACKEND_URL!, ...(process.env.NEXT_ADDITIONAL_ORIGINS?.split(",") ?? [])].map((origin) => new URL(origin));

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@libsql/client", "@react-pdf/renderer"],
  allowedDevOrigins: publicOrigins.map((origin) => origin.hostname),
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: publicOrigins.map((origin) => origin.host),
    },
  },
  // Τα SQL migrations διαβάζονται στο runtime (drizzle migrator) – πρέπει να συμπεριληφθούν στο serverless bundle (Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
