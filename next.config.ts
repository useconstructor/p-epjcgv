import type {NextConfig} from 'next';
const nextConfig:NextConfig={
  experimental: {
    // Keep runtime route caches in memory so serving the app does not mutate
    // the compiled artifact. Library records remain persisted in Turso.
    isrFlushToDisk: false,
  },
};
export default nextConfig;
