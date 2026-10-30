import type { NextConfig } from "next";
const config:NextConfig={output:"standalone",serverExternalPackages:["postgres","ioredis","bullmq","@composio/core","@composio/vercel"]};
export default config;
