import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No Vercel features anywhere: nodejs-runtime route handlers (see app/api/*), no edge
  // runtime, no image-optimization service dependency — portable containers on AKS.
  // (M3A note: we deliberately do NOT use output:"standalone" + node server.js. Next 15
  // makes `next start` refuse to run under standalone, and the whole dev+demo story of
  // this repo is `npm run start` on :3000; the container therefore runs the exact same
  // command with a pruned production node_modules — one start path, no drift.)
};

export default nextConfig;
