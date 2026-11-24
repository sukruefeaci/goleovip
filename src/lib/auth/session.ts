/**
 * İmzalı oturum çerezi (HMAC-SHA256, Web Crypto). Hem middleware (edge) hem sunucuda çalışır.
 * Biçim: base64url(JSON yük) + "." + base64url(imza)
 */

export const SESSION_COOKIE = "goleo_session";
export const SESSION_DAYS = 30;

export interface Session {
  uid: string;
  email: string;
  name: string;
  exp: number; // unix ms
}

const DEV_SECRET = "goleovip-yerel-gelistirme-anahtari-uretimde-kullanmayin";

/** Üretimde AUTH_SECRET zorunlu; yoksa null (giriş devre dışı) */
export function authSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(s: Omit<Session, "exp">, secret: string): Promise<string> {
  const payload: Session = { ...s, exp: Date.now() + SESSION_DAYS * 86400_000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string | null): Promise<Session | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
