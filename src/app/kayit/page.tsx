import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">G</span>
          <div>
            <h1>Hesap oluştur</h1>
            <p className="muted">Ücretsiz kaydol; maç değerlemeleri ve otomatik kupon oluşturucu açılsın.</p>
          </div>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
