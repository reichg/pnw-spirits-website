import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev-server asset/HMR requests proxied through the cloudflared tunnel origin.
  allowedDevOrigins: ["pnw-spirits.gabe-reichenberger.com"],
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
