import CouponBuilder from "@/components/CouponBuilder";
import { loadAnalyses, toCouponMatches } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CouponPage() {
  const { analyses, banner } = await loadAnalyses();
  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <CouponBuilder matches={toCouponMatches(analyses)} />
    </div>
  );
}
