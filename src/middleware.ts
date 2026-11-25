import { NextResponse, type NextRequest } from "next/server";
import { authSecret, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** Giriş yapmamış kullanıcılar yalnız giriş, kayıt ve "Nasıl çalışır?" sayfalarını görebilir */
const PUBLIC = ["/giris", "/kayit", "/nasil-calisir", "/kurulum"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, authSecret());
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
