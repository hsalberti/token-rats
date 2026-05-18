/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["@token-rats/contracts"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
