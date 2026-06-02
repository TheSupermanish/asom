/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @tsugu/sdk ships ESM from dist; transpile it (and silence optional WC/pino externals).
  transpilePackages: ["@tsugu/sdk"],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
