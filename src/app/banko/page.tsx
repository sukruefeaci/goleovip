import { redirect } from "next/navigation";

/** Banko sekmesi kaldırıldı; yerine Dönüş sekmesi */
export default function BankoPage() {
  redirect("/donus");
}
