export default function Loading() {
  return (
    <main className="route-state" aria-busy="true" aria-live="polite">
      <div className="route-loading" role="status">
        <span className="brand-mark" aria-hidden="true">AI</span>
        <span>Preparando a experiência…</span>
      </div>
    </main>
  );
}
