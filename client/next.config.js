/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Avoid streaming-metadata hydration mismatches (esp. DevTools mobile emulation)
  htmlLimitedBots: /.*/,
};

module.exports = nextConfig;
