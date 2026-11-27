import Link from "next/link";
import { inBackground } from "@/lib/background";
import { loadAnalyses } from "@/lib/data";
import { kickoffParts } from "@/lib/format";
import { getStore } from "@/lib/auth/store";
import { trDate } from "@/lib/tracking";
import AutoRefresh from "@/components/AutoRefresh";
import {
  donusLearn,
  donusTotals,
  GROUP_LABEL,
  learnFactor,
  loadDonusDay,
  PER_GROUP,
  recordDonus,
  selectDay,
  settleDonus,
  tally,
  type DonusGroup,
  type DonusPick,
  type DonusTally,
} from "@/lib/donus";

export const dynamic = "force-dynamic";

const DAYS = { dun: -1, bugun: 0, yarin: 1 } as const;
type DayKey = keyof typeof DAYS;
const LABEL: Record<DayKey, string> = { dun: "Dün", bugun: "Bugün", yarin: "Yarın" };
const pc = (x: number) => `%${(x * 100).toFixed(1).replace(".", ",")}`;

function PickCard({ p, now }: { p: DonusPick; now: number }) {
  const k = kickoffParts(p.kickoff);
  const started = new Date(p.kickoff).getTime() <= now;
  const st = p.result ? (p.result.won ? "won" : "lost") : null;
  return (
    <Link href={`/mac/${p.id}`} className={`card sk-row${st ? ` oa-${st}` : ""}`}>
      <div className="sk-top">
        <span className="muted small">
          {k.date} · {k.time} · {p.league}
        </span>
        {p.result ? (
          <b className="mrow-score">
            İY {p.result.hht}-{p.result.aht} · MS {p.result.hg}-{p.result.ag}
          </b>
        ) : started ? (
          <span className="muted small">başladı / sonuç bekleniyor</span>
        ) : null}
      </div>
      <div className="sk-teams">
        {p.home} <span className="vs">vs</span> {p.away}
      </div>
      <div className="sk-pick">
        <span className="muted small">İY/MS</span>
        <b style={{ fontSize: 20 }}>{p.outcome}</b>
        {p.odd ? <span className="oddpill">{p.odd.toFixed(2)}</span> : <span className="muted small">iddaa oranı yok</span>}
        <span className="muted small">
          Olasılık <b>{pc(p.prob)}</b>
        </span>
        {st && <span className={`mp-badge ${st}`}>{st === "won" ? "✓ Tuttu" : `✗ Tutmadı (${p.result!.real})`}</span>}
      </div>
      <ul className="muted small dn-why">
        {p.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </Link>
  );
}

function Stat({ title, t }: { title: string; t: DonusTally }) {
  return (
    <div className="daystat card">
      <span>
        {title}: <b>{t.shared}</b> tahmin paylaşıldı · <b>{t.won}</b> tuttu
        {t.decided < t.shared && <span className="muted small"> ({t.shared - t.decided} sonuç bekleniyor)</span>}
      </span>
      {t.decided > 0 && <b className={t.won ? "pos" : "neg"}>%{Math.round((t.won / t.decided) * 100)}</b>}
      {t.oddsKnown > 0 && (
        <span className="muted small">
          100 TL ile: <b className={t.profitKnown >= 0 ? "pos" : "neg"}>{t.profitKnown >= 0 ? "+" : ""}{Math.round(t.profitKnown).toLocaleString("tr-TR")} TL</b>
        </span>
      )}
    </div>
  );
}

export default async function DonusPage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams;
  const day: DayKey = gun && gun in DAYS ? (gun as DayKey) : "bugun";
  const now = Date.now();
  const tracking = !!getStore();
  const today = trDate(now),
    yesterday = trDate(now - 86400_000);
  const date = trDate(now + DAYS[day] * 86400_000);
  const { analyses, banner } = await loadAnalyses();

  if (tracking)
    inBackground(async () => {
      await Promise.all([settleDonus(today), settleDonus(yesterday)]);
      await recordDonus(analyses, now);
    });

  const [stored, todayStored, ydStored, totals, learn] = await Promise.all([
    loadDonusDay(date),
    date === today ? Promise.resolve(null) : loadDonusDay(today),
    loadDonusDay(yesterday),
    tracking ? donusTotals(now).catch(() => null) : Promise.resolve(null),
    donusLearn().catch(() => null),
  ]);
  const picks = day === "dun" ? stored : await selectDay(analyses, date, now, stored);
  // gösterilen seçimde kayıttaki sonuçlar korunur
  const resById = new Map(stored.filter((p) => p.result).map((p) => [p.id, p.result]));
  for (const p of picks) if (!p.result && resById.has(p.id)) p.result = resById.get(p.id);
  const todayPicks = date === today ? picks : todayStored ?? [];

  return (
    <div className="page-narrow">
      {banner && <div className="notice">⚠ {banner}</div>}
      <div className="page-head">
        <h1>🔄 Dönüş</h1>
        <AutoRefresh seconds={60} />
      </div>

      <Stat title="Bugün" t={tally(todayPicks)} />
      {ydStored.length > 0 && <Stat title="Dün" t={tally(ydStored)} />}
      {totals && totals.all.shared > 0 && (
        <div className="card pad dn-total">
          <div className="learn-row">
            <span>Son 30 gün</span>
            <b>
              {totals.all.won} / {totals.all.decided} tuttu
              {totals.all.decided > 0 && ` · %${Math.round((totals.all.won / totals.all.decided) * 100)}`}
            </b>
          </div>
          {(["ters", "beraber"] as DonusGroup[]).map((g) => {
            const t = totals.byGroup[g];
            return (
              <div key={g} className="learn-row small">
                <span>{GROUP_LABEL[g]}</span>
                <b>
                  {t.won} / {t.decided}
                  {t.oddsKnown > 0 && ` · 100 TL: ${t.profitKnown >= 0 ? "+" : ""}${Math.round(t.profitKnown).toLocaleString("tr-TR")} TL`}
                </b>
              </div>
            );
          })}
          {learn && (learn.ters.n > 0 || learn.beraber.n > 0) && (
            <p className="muted small">
              Öğrenme: ters dönüşte beklenen {learn.ters.pred.toFixed(1)}, tutan {learn.ters.hits} (düzeltme ×{learnFactor(learn.ters).toFixed(2)}) · beraberliğe
              dönüşte beklenen {learn.beraber.pred.toFixed(1)}, tutan {learn.beraber.hits} (×{learnFactor(learn.beraber).toFixed(2)})
            </p>
          )}
        </div>
      )}

      <div className="daytabs" role="tablist">
        {(Object.keys(DAYS) as DayKey[]).map((k) => (
          <Link key={k} href={k === "bugun" ? "/donus" : `/donus?gun=${k}`} className={k === day ? "on" : ""} role="tab" aria-selected={k === day}>
            {LABEL[k]}
            <small>{kickoffParts(new Date(now + DAYS[k] * 86400_000).toISOString()).date}</small>
          </Link>
        ))}
      </div>

      <p className="muted small rule-note">
        Her gün bültenden {PER_GROUP * 2} maç: İY/MS <b>1/2 · 2/1</b> olma ihtimali en yüksek {PER_GROUP} maç ve <b>1/X · 2/X</b> olma ihtimali en yüksek{" "}
        {PER_GROUP} maç. Sıralama maç analizinin İY/MS olasılığına (ilk yarı gol payları, gol beklentisi, piyasa), takımların son maçlarda bu dönüşü ne sık
        yaşadığına, önde olan takımın öndeyken ikinci yarıda gol yeme ve geride olanın geriden gol atma sıklığına ve sistemin kendi sonuçlarına göre yapılır.
        Maç başlayınca tahmin kilitlenir. Bunlar yüksek oranlı, düşük olasılıklı tahminlerdir; çoğu tutmaz.
      </p>

      {(["ters", "beraber"] as DonusGroup[]).map((g) => {
        const list = picks.filter((p) => p.group === g);
        return (
          <section key={g} className="dn-group">
            <h2 className="sk-tier">{GROUP_LABEL[g]}</h2>
            <div className="oa-list">
              {list.map((p) => (
                <PickCard key={p.id} p={p} now={now} />
              ))}
              {!list.length && <div className="card pad empty">{day === "dun" ? "Bu gün için kayıtlı tahmin yok." : "Bu gün için uygun maç yok."}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
