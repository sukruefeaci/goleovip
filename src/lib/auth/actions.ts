"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authSecret, SESSION_COOKIE, SESSION_DAYS, signSession } from "./session";
import { hashPassword, verifyPassword } from "./password";
import { createUser, findUser, getStore } from "./store";

export interface FormState {
  error?: string;
  email?: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;

function setupError(): string | null {
  if (!authSecret()) return "Site kurulumu eksik: AUTH_SECRET ortam değişkeni tanımlı değil.";
  if (!getStore()) return "Site kurulumu eksik: kullanıcı veritabanı (Upstash Redis) bağlı değil.";
  return null;
}

/** Yalnız site içi yönlendirmeye izin ver (açık yönlendirme açığını önler) */
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

async function startSession(user: { id: string; email: string; name: string }) {
  const token = await signSession({ uid: user.id, email: user.email, name: user.name }, authSecret()!);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const setup = setupError();
  if (setup) return { error: setup, email };
  if (!EMAIL_RE.test(email) || !password) return { error: "E-posta ve şifre girin.", email };

  const store = getStore()!;
  const failKey = `fail:${email}`;
  if ((Number(await store.get(failKey)) || 0) >= MAX_FAILS)
    return { error: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.", email };

  const user = await findUser(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await store.incr(failKey, LOCK_SECONDS);
    return { error: "E-posta veya şifre hatalı.", email };
  }
  await store.reset(failKey);
  await startSession(user);
  redirect(safeNext(form.get("next")));
}

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");
  const back = { email, name };
  const setup = setupError();
  if (setup) return { error: setup, ...back };
  if (name.length < 2 || name.length > 40) return { error: "Adınızı girin (2–40 karakter).", ...back };
  if (!EMAIL_RE.test(email)) return { error: "Geçerli bir e-posta adresi girin.", ...back };
  if (password.length < 8) return { error: "Şifre en az 8 karakter olmalı.", ...back };
  if (password !== password2) return { error: "Şifreler eşleşmiyor.", ...back };
  if (form.get("age") !== "on") return { error: "Kayıt için 18 yaşından büyük olduğunuzu onaylamalısınız.", ...back };

  const user = { id: randomUUID(), email, name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  if (!(await createUser(user))) return { error: "Bu e-posta ile zaten bir hesap var. Giriş yapın.", ...back };
  await startSession(user);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/giris");
}
