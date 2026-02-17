// Load environment variables from .env file in production
require('dotenv').config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    // removeConsole: process.env.NODE_ENV === "production", // Temporarily disabled for debugging
  },
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Turbopack configuration (required for Next.js 16)
  turbopack: {},
  // Public environment variables
  env: {
    NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE: process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE || 'customer-7w5kuj2frxw5djtl',
    NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH: process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH || 'LDTNFDrUnJY_bFTI66y-jw',
  },
  // Отключаем статическую оптимизацию для API routes
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Исключаем проблемные модули из сборки, используя встроенный URL из Node.js
      config.resolve.alias = {
        ...config.resolve.alias,
        'whatwg-url': false,
        'webidl-conversions': false,
      };
      // Настраиваем externals для правильной обработки
      const originalExternals = config.externals || [];
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        ({ request }, callback) => {
          if (request && (request === 'whatwg-url' || request === 'webidl-conversions')) {
            // Возвращаем пустой объект вместо модуля
            return callback(null, '{}');
          }
          callback();
        },
      ];
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "imagedelivery.net",
      },
      {
        protocol: "https",
        hostname: "ficwriter.info",
      },
      {
        protocol: "https",
        hostname: "**.cloudflare.com",
      },
      {
        protocol: "https",
        hostname: "**.yell.ru",
      },
      {
        protocol: "https",
        hostname: "storage.prrv.tech",
      },
    ],
  },
  // CORS настройки через headers
  async headers() {
    return [
      {
        // Применяем ко всем API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.ALLOWED_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Requested-With",
          },
        ],
      },
      {
        // CSP headers для всех страниц
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://embed.cloudflarestream.com https://*.cloudflarestream.com", // 'unsafe-eval' для Next.js в dev
              "style-src 'self' 'unsafe-inline'", // 'unsafe-inline' для Tailwind
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.cloudflarestream.com https://cloudflarestream.com https://imagedelivery.net https://prrv.tech https://www.prrv.tech",
              "frame-src 'self' https://*.cloudflarestream.com",
              "media-src 'self' https://*.cloudflarestream.com blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=*, geolocation=(), encrypted-media=*, autoplay=*",
          },

        ],
      },
    ];
  },
};

module.exports = nextConfig;
