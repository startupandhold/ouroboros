/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
    "@solana/wallet-adapter-base",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
      {
        protocol: "https",
        hostname: "images.coin-communities.xyz",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "token-media.defined.fi",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
