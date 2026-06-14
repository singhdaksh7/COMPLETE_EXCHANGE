/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The browser talks to the backend directly via NEXT_PUBLIC_API_URL /
  // NEXT_PUBLIC_ADMIN_API_URL; lint is run separately via `npm run lint`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
