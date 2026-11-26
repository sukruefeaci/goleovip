/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Telegram kartları (canlı, maç önü, sonuç, istatistik) zamanlayıcı dahil birçok yerden çizilir:
  // yazı tipleri tüm sunucu fonksiyonlarına dahil edilsin
  outputFileTracingIncludes: {
    "/**/*": ["./assets/fonts/**"],
  },
};
