/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Telegram kartı için yazı tipleri sunucu fonksiyonlarına dahil edilsin
  outputFileTracingIncludes: {
    "/canli": ["./assets/fonts/**"],
    "/api/telegram/test": ["./assets/fonts/**"],
  },
};
