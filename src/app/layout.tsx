import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maç Değerleme",
  description: "iddaa oranlarını Avrupa piyasası ve istatistik modeliyle karşılaştırır.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="logo">◉</span>
            <span>
              <strong>Maç Değerleme</strong>
              <small>iddaa · Avrupa piyasası · istatistik</small>
            </span>
          </Link>
          <nav>
            <Link href="/">Maçlar</Link>
            <Link href="/nasil-calisir">Nasıl çalışır?</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
