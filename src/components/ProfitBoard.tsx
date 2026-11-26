import { STAKE, type DayPnl } from "@/lib/pnl";

const tl = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
const signedTl = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("tr-TR")} TL`;
const cls = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

function Row({ label, d, sub }: { label: string; d: DayPnl; sub?: string }) {
  const roi = d.staked ? d.profit / d.staked : 0;
  return (
    <div className="pb-row">
      <div className="pb-head">
        <b>{label}</b>
        {sub && <span className="muted small">{sub}</span>}
        {d.counted > 0 && (
          <span className={`pb-profit ${cls(d.profit)}`}>
            {signedTl(d.profit)} <small>(%{roi >= 0 ? "+" : "−"}{Math.abs(roi * 100).toFixed(1)})</small>
          </span>
        )}
      </div>
      <div className="pb-counts small">
        <span>
          <b>{d.shared}</b> tahmin
        </span>
        <span>
          <b>{d.settled}</b> sonuçlandı
        </span>
        <span>
          <b className={d.settled ? (d.hits / d.settled >= 0.5 ? "pos" : "neg") : ""}>{d.hits}</b> tuttu
          {d.settled > 0 && <span className="muted"> (%{Math.round((d.hits / d.settled) * 100)})</span>}
        </span>
        {d.counted > 0 && (
          <span className="muted">
            yatırılan {tl(d.staked)} · dönen {tl(d.returned)}
          </span>
        )}
      </div>
      {d.noOdds > 0 && <div className="muted small">Oranı olmayan {d.noOdds} tahmin hesaba katılmadı.</div>}
    </div>
  );
}

const chip = (label: string, d: DayPnl) => (
  <span className="pb-chip">
    {label} <b className={d.counted ? cls(d.profit) : "muted"}>{d.counted ? signedTl(d.profit) : "—"}</b>
  </span>
);

/** Sayfa başı (katlanır): her tahmine 100 TL yatırılsaydı bugün / dün / başından beri */
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
    <details className="card pboard">
      <summary>
        <span className="pb-title">💰 {title}</span>
        <span className="pb-chips">
          {chip("Bugün", today)}
          {chip("Dün", yesterday)}
          {total && total.days > 0 && chip("Toplam", total.total)}
        </span>
      </summary>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
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
    </details>
  );
}
