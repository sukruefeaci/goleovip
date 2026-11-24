"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type FormState } from "@/lib/auth/actions";

function ErrorBox({ state }: { state: FormState }) {
  return state.error ? (
    <div className="auth-error" role="alert">
      {state.error}
    </div>
  ) : null;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        E-posta
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label>
        Şifre
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <ErrorBox state={state} />
      <button className="btn primary block" disabled={pending}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
      <p className="auth-switch">
        Hesabın yok mu? <Link href="/kayit">Kaydol</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, {});
  return (
    <form action={action} className="auth-form">
      <label>
        Ad
        <input name="name" autoComplete="name" required minLength={2} maxLength={40} defaultValue={state.name} />
      </label>
      <label>
        E-posta
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label>
        Şifre <small>(en az 8 karakter)</small>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Şifre tekrar
        <input name="password2" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label className="check">
        <input name="age" type="checkbox" required /> 18 yaşından büyüğüm ve bu sitenin yalnız bilgi amaçlı olduğunu, kazanç
        garantisi vermediğini biliyorum.
      </label>
      <ErrorBox state={state} />
      <button className="btn primary block" disabled={pending}>
        {pending ? "Hesap oluşturuluyor…" : "Kaydol"}
      </button>
      <p className="auth-switch">
        Zaten hesabın var mı? <Link href="/giris">Giriş yap</Link>
      </p>
    </form>
  );
}
