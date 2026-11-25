"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Maçlar", icon: "⚽", match: (p: string) => p === "/" || p.startsWith("/mac/") },
  { href: "/kupon", label: "Kupon", icon: "🎟️", match: (p: string) => p.startsWith("/kupon") },
  { href: "/banko", label: "Banko", icon: "🎯", match: (p: string) => p.startsWith("/banko") },
  { href: "/nasil-calisir", label: "Bilgi", icon: "📘", match: (p: string) => p.startsWith("/nasil-calisir") },
];

export default function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname() ?? "/";
  return (
    <nav className={variant === "top" ? "topnav" : "bottomnav"} aria-label={variant === "top" ? "Ana menü" : "Alt menü"}>
      {ITEMS.map((it) => {
        const active = it.match(path);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {variant === "bottom" && <span aria-hidden>{it.icon}</span>}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
