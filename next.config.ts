import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Enable standalone output for Docker
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // Allow larger file uploads
    },
  },
  async rewrites() {
    return [
      {
        source: '/audiomass',
        destination: '/audiomass/index.html',
      },
    ];
  },
};

export default nextConfig;
