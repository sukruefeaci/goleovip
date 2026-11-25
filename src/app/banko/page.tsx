import Link from "next/link";
import { loadAnalyses, toCouponMatches } from "@/lib/data";
import { bankoPicks, BANKO_MIN_ODD } from "@/lib/coupon";
import { kickoffParts, signedPct } from "@/lib/format";
import WinConfidence from "@/components/WinConfidence";

export const dynamic = "force-dynamic";

export default async function BankoPage() {
  const { analyses, banner } = await loadAnalyses();
  const result = bankoPicks(toCouponMatches(analyses), 2);
  const c = result.coupon;

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}

      <div className="page-head">
        <h1>
          <span aria-hidden>🎯</span> Banko
        </h1>
        <span className="muted small">Yaklaşan tüm maçlar içinden modelin en güvendiği iki tercih</span>
      </div>

      {!c ? (
        <div className="card pad empty">{result.message ?? "Şu an banko çıkacak kadar güvenilir tercih yok."}</div>
      ) : (
        <>
          <div className="banko-list">
            {c.legs.map((l, i) => {
              const k = kickoffParts(l.match.kickoff);
              return (
                <Link key={l.match.id} href={`/mac/${l.match.id}`} className="card banko">
                  <div className="banko-rank">{i + 1}</div>
                  <div className="banko-body">
                    <div className="banko-meta">
                      <span className="chip">{l.match.league}</span>
                      <span className="muted small">
                        {k.date} · {k.time}
                      </span>
                    </div>
                    <div className="banko-match">
                      {l.match.home} <span className="vs">vs</span> {l.match.away}
                    </div>
                    <div className="banko-pick">
                      <span className="muted">{l.pick.market}</span>
                      <b>{l.pick.selection}</b>
                    </div>
                    <div className="banko-stats two">
                      <div>
                        <span>Oran</span>
                        <b className="oddpill">{l.pick.odd.toFixed(2)}</b>
                      </div>
                      <div>
                        <span>Getiri</span>
                        <b className={l.pick.ev >= 0 ? "pos" : "neg"}>{signedPct(l.pick.ev)}</b>
                      </div>
                    </div>
                    <WinConfidence
                      prob={l.pick.prob}
                      sigma={l.pick.sigma}
                      required={l.pick.required}
                      confidence={l.pick.confidence ?? 0}
                      parts={l.pick.confidenceParts ?? []}
                    />
                    {l.pick.mbc > 1 && <p className="muted small banko-mbs">MBS {l.pick.mbc}: tek başına oynanamaz, en az {l.pick.mbc} maçlık kuponda.</p>}
                  </div>
                </Link>
              );
            })}
          </div>

          <section className="card pad banko-combo">
            <h3 className="card-title">İkisini birlikte oynarsan</h3>
            <div className="coupon-totals">
              <div>
                <span>Toplam oran</span>
                <b>{c.totalOdd.toFixed(2)}</b>
              </div>
              <div>
                <span>Kazanma olasılığı</span>
                <b className={c.winProb >= 0.5 ? "prob-good" : "prob-mid"}>%{(c.winProb * 100).toFixed(1)}</b>
              </div>
              <div>
                <span>100 TL → kazanç</span>
                <b>{(100 * c.totalOdd).toFixed(0)} TL</b>
              </div>
            </div>
            <p className="coupon-note">
              Banko "kesin" demek değildir: model en güvendiği bu iki tercihten birinin yaklaşık <b>%{Math.round((1 - c.winProb) * 100)}</b> ihtimalle
              tutmayacağını hesaplıyor. Seçim yalnız Avrupa piyasasıyla doğrulanabilen pazarlardan (maç sonucu, gol, ilk yarı) ve en az{" "}
              {BANKO_MIN_ODD.toFixed(2)} oranlı seçeneklerden yapılır; korner ve kart dahil edilmez.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
