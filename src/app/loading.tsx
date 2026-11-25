/** Sekme değişirken anında gösterilen iskelet (sayfa sunucuda hazırlanırken) */
export default function Loading() {
  return (
    <div className="page-narrow" aria-busy="true" aria-live="polite">
      <div className="skel skel-title" />
      <div className="skel skel-line" />
      <div className="skel skel-card" />
      <div className="skel skel-card" />
      <div className="skel skel-card" />
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
