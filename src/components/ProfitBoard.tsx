import { STAKE, type DayPnl } from "@/lib/pnl";

const tl = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
const signedTl = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("tr-TR")} TL`;

function Row({ label, d, sub }: { label: string; d: DayPnl; sub?: string }) {
  const roi = d.staked ? d.profit / d.staked : 0;
  const cls = d.profit > 0 ? "pos" : d.profit < 0 ? "neg" : "";
  return (
    <div className="pb-row">
      <div className="pb-head">
        <b>{label}</b>
        {sub && <span className="muted small">{sub}</span>}
      </div>
      <div className="pb-counts small">
        <span>
          <b>{d.shared}</b> tahmin paylaşıldı
        </span>
        <span>
          <b>{d.settled}</b> sonuçlandı
        </span>
        <span>
          <b className={d.settled ? (d.hits / d.settled >= 0.5 ? "pos" : "neg") : ""}>{d.hits}</b> tuttu
          {d.settled > 0 && <span className="muted"> (%{Math.round((d.hits / d.settled) * 100)})</span>}
        </span>
      </div>
      {d.counted > 0 ? (
        <div className="pb-money small">
          <span>
            Yatırılan <b>{tl(d.staked)}</b>
          </span>
          <span>
            Dönen <b>{tl(d.returned)}</b>
          </span>
          <span className={`pb-profit ${cls}`}>
            {signedTl(d.profit)} <small>(%{roi >= 0 ? "+" : "−"}{Math.abs(roi * 100).toFixed(1)})</small>
          </span>
        </div>
      ) : (
        <div className="muted small">Henüz sonuçlanan tahmin yok.</div>
      )}
      {d.noOdds > 0 && <div className="muted small">Oranı olmayan {d.noOdds} tahmin kâr hesabına katılmadı.</div>}
    </div>
  );
}

/** Sayfa başı: her tahmine 100 TL yatırılsaydı bugün / dün / başından beri */
export default function ProfitBoard({
  title,
  today,
  yesterday,
  total,
}: {
  title: string;
  today: DayPnl;
  yesterday: DayPnl;
  total: { total: DayPnl; days: number; since: string | null } | null;
}) {
  return (
    <section className="card pad pboard">
      <h2 className="card-title">{title}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Her tahmine {STAKE} TL yatırılsaydı. Tutarsa {STAKE} × oran döner, tutmazsa 0.
      </p>
      <Row label="Bugün" d={today} />
      <Row label="Dün" d={yesterday} />
      {total && total.days > 0 && (
        <Row
          label="Başından beri"
          d={total.total}
          sub={`${total.days} gün${total.since ? ` · ${total.since.split("-").reverse().join(".")} tarihinden beri` : ""}`}
        />
      )}
    </section>
  );
}
