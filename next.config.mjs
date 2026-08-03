/** @type {import('next').NextConfig} */

const AGENT_GATEWAY = (process.env.AGENT_GATEWAY || 'https://fc.xwbuilders.com').trim().replace(/\/+$/, '');

const nextConfig = {
  transpilePackages: [
    'ustudio-sdk',
    'soonspacejs',
    '@soonspacejs/plugin-cps-soonmanager',
    '@soonspacejs/plugin-atmosphere',
    '@soonspacejs/plugin-effect',
    '@soonspacejs/plugin-fds',
    '@soonspacejs/plugin-flow',
    '@soonspacejs/plugin-gs3d-loader',
    '@soonspacejs/plugin-poi-renderer',
    '@soonspacejs/plugin-tiles',
  ],
  async rewrites() {
    return [
      {
        source: '/uagent-service/:path*',
        destination: `${AGENT_GATEWAY}/uagent-service/:path*`,
      },
    ];
  },
};

export default nextConfig;
