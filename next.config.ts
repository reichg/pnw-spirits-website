import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pnw-spirits.s3.us-west-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
