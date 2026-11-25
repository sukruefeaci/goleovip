import type { Session } from "./auth/session";

/**
 * Admin: e-postası ADMIN_EMAILS ortam değişkeninde (virgülle ayrılmış) olan kullanıcılar.
 * Vercel → Settings → Environment Variables → ADMIN_EMAILS
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdmin = (u: Pick<Session, "email"> | null | undefined) => !!u && adminEmails().includes(u.email.toLowerCase());
