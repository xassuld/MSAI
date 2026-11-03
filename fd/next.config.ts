import type { NextConfig } from "next";
import { backendApiUrl } from "./src/lib/backend-api";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*",
        destination: `${backendApiUrl}/api/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
