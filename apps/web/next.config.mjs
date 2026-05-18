/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["@token-rats/contracts"],
  experimental: {
    typedRoutes: true,
  },
  webpack(webpackConfig) {
    // Allow webpack to resolve `.js` extension imports that point to `.ts` source files.
    // This is needed because @token-rats/contracts uses ESM-style `.js` extensions in
    // its TypeScript source (correct for native ESM), but webpack needs the hint.
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
