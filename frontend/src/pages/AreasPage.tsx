import { AreaCard } from '../components/areas/Scorecard';
import { useApp } from '../state/AppContext';

export function AreasPage() {
  const { areas, loading } = useApp();
  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="areas-heading">
      <header>
        <p className="eco-label">Accountability</p>
        <h1 id="areas-heading" className="font-display text-3xl font-bold">Area scorecards</h1>
        <p className="mt-1 text-sm text-muted">
          Scores appear only after ten distinct authenticated reporters. No ward numbers are guessed without official shapefiles.
        </p>
      </header>
      {loading && <p className="text-sm text-muted">Loading scorecards…</p>}
      {areas.map((area) => <AreaCard key={area.id} area={area} />)}
    </section>
  );
}
