import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/");
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">G</span>
          <div>
            <h1>Tekrar hoş geldin</h1>
            <p className="muted">Maç analizlerini ve kupon oluşturucuyu görmek için giriş yap.</p>
          </div>
        </div>
        <LoginForm next={safe} />
      </div>
    </div>
  );
}
