import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BACKEND_HTTP_URL:
      process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "http://localhost:8000",
    NEXT_PUBLIC_BACKEND_WS_URL:
      process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000",
  },
};

export default nextConfig;
