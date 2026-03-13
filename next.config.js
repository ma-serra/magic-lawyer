const { withWorkflow } = require("workflow/next");

/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

const nextConfig = {
  output: isVercel ? undefined : "standalone",
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["ioredis"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dummyimage.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // Aumentar limite para 10MB (padrão é 1MB)
    },
    webpackMemoryOptimizations: true,
    staticGenerationRetryCount: 1,
    staticGenerationMaxConcurrency: isVercel ? 1 : 8,
    staticGenerationMinPagesPerWorker: isVercel ? 100 : 25,
  },
};

module.exports = withWorkflow(nextConfig);
