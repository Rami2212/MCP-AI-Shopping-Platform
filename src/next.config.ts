import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "static2.kapruka.com",
        protocol: "https",
      },
      {
        hostname: "static.kapruka.com",
        protocol: "https",
      },
      {
        hostname: "partnercentral.kapruka.com",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
