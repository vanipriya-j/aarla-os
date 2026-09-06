import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Custom PO attachments (images / design files) go through server actions as base64.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // Include migration SQL in the serverless bundle for /api/setup (no local CLI needed).
  outputFileTracingIncludes: {
    "/api/setup": ["./supabase/migrations/**/*"],
  },
};

export default nextConfig;
