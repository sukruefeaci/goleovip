import { test } from "node:test";
import assert from "node:assert/strict";

const { signSession, verifySession } = await import("../src/lib/auth/session.ts");
const { hashPassword, verifyPassword } = await import("../src/lib/auth/password.ts");

test("oturum imzası doğrulanır, kurcalanırsa reddedilir", async () => {
  const secret = "test-secret-1234567890";
  const t = await signSession({ uid: "u1", email: "a@b.co", name: "Ali" }, secret);
  const s = await verifySession(t, secret);
  assert.equal(s?.email, "a@b.co");
  assert.equal(await verifySession(t, "baska-gizli-anahtar-123"), null);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "x", email: "x@x.co", name: "X", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(await verifySession(`${forged}.${sig}`, secret), null);
  assert.equal(await verifySession(undefined, secret), null);
  assert.ok(body);
});

test("şifre özeti", async () => {
  const h = await hashPassword("gizli-sifre-1");
  assert.ok(h.startsWith("scrypt$"));
  assert.ok(await verifyPassword("gizli-sifre-1", h));
  assert.ok(!(await verifyPassword("yanlis-sifre", h)));
});
