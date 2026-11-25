import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth/current";
import { logout } from "@/lib/auth/actions";
import NavLinks from "@/components/NavLinks";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "goleo VIP — maç değerleme",
  description: "iddaa oranlarını Avrupa piyasası ve istatistik modeliyle karşılaştırır, otomatik kupon oluşturur.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0b1a" };

function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">G</span>
      <span className="brand-name">
        goleo<span className="brand-vip">VIP</span>
      </span>
    </Link>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="tr">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Brand />
            {user && <NavLinks variant="top" />}
            <div className="userbox">
              {user ? (
                <>
                  <span className="avatar-sm" title={user.email}>
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hide-sm">{user.name}</span>
                  {isAdmin(user) && (
                    <Link href="/admin" className="btn ghost sm" aria-label="Admin paneli">
                      ⚙︎<span className="hide-sm"> Admin</span>
                    </Link>
                  )}
                  <Link href="/nasil-calisir" className="show-sm muted small" aria-label="Bilgi">
                    ⓘ
                  </Link>
                  <form action={logout}>
                    <button className="btn ghost sm">Çıkış</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/giris" className="btn ghost sm">
                    Giriş
                  </Link>
                  <Link href="/kayit" className="btn primary sm">
                    Kaydol
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="container">{children}</main>

        {user && <NavLinks variant="bottom" />}

        <footer className="footer">
          18 yaş altı kullanamaz. Bu site yalnız bilgi amaçlıdır; hiçbir tahmin kazanç garantisi vermez. Kumar bağımlılığı için yardım:
          Yeşilay Danışmanlık Merkezi <b>115</b>.
        </footer>
      </body>
    </html>
  );
}
