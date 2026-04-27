/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
  // Cornerstone3D + dicom-image-loader requieren este fallback porque
  // dicom-parser tiene una dependencia transitiva en `fs` que en el browser
  // no existe. Sin esto el bundle del cliente falla en build.
  // Ref: https://www.cornerstonejs.org/docs/getting-started/vue-angular-react-etc/
  webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
