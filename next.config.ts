import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Include migration SQL in the serverless bundle for /api/setup (no local CLI needed).
  outputFileTracingIncludes: {
    "/api/setup": ["./supabase/migrations/**/*"],
  },
};

export default nextConfig;
