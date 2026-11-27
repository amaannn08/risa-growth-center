import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@gc/core', '@gc/db', '@gc/ai'],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  typescript: { ignoreBuildErrors: false },
};
export default config;
