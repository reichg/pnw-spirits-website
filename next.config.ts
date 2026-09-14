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
    // Allow-list of `quality` values the optimizer will serve. This is an
    // allow-list, not a default: the optimizer rejects an undeclared `q` with
    // a 400 ("q" parameter is not allowed), so a value used by any <Image>
    // must appear here or that image fails to load outright.
    //
    //   75 - Next's own default, and the value every <Image> that omits a
    //        `quality` prop resolves to. Load-bearing: removing it breaks all
    //        of them at once.
    //   85 - photographic content cards. Cover photos are uploaded at ~6192px
    //        and downscaled hard, which concentrates fine texture (glass,
    //        liquid, foliage) into the frequencies WebP sheds first at 75.
    //        Past ~85 WebP's returns collapse: bytes keep climbing while the
    //        visible difference does not.
    //
    // Each distinct value is a separate optimizer cache entry per image per
    // width per format, so keep this list short and deliberate.
    qualities: [75, 85],
  },
};

export default nextConfig;
