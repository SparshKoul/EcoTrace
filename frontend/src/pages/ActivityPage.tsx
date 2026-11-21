import { Chip } from '../components/ui/Chip';
import { TYPE_LABEL } from '../config/rules';
import { useApp } from '../state/AppContext';

export function ActivityPage() {
  const { activity } = useApp();
  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="activity-heading">
      <header>
        <p className="eco-label">Your reports</p>
        <h1 id="activity-heading" className="font-display text-3xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted">
          New reports appear here instantly with status PROCESSING, then update after AI verification.
        </p>
      </header>
      {activity.length === 0 && (
        <div className="eco-card text-center">
          <p className="font-display text-xl font-bold">No reports yet</p>
          <p className="mt-1 text-sm text-muted">Your first verified report will show up here.</p>
        </div>
      )}
      <ul className="space-y-3">
        {activity.map((item) => (
          <li key={item.id} className="eco-card flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">{TYPE_LABEL[item.type] ?? item.type}</p>
              <p className="text-xs text-muted">
                {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)} · ±{Math.round(item.location.accuracyM)} m
              </p>
              <p className="mt-1 text-sm text-muted">{item.detail}</p>
              <p className="mt-1 text-[11px] text-muted">{new Date(item.createdAt).toLocaleString()}</p>
            </div>
            <Chip tone={item.status === 'PROCESSING' ? 'warn' : item.status === 'REJECTED' ? 'bad' : 'accent'}>
              {item.status}
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
