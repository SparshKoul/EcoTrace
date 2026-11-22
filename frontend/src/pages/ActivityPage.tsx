import { useState } from 'react';
import { ComplaintModal } from '../components/complaint/ComplaintModal';
import { ActivitySection } from '../components/ActivitySection';
import { Button } from '../components/ui/Button';
import { useApp } from '../state/AppContext';
import { useReports } from '../context/ReportContext';
import type { Tab } from '../navigation';

export function ActivityPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { activityV1, signedIn } = useApp();
  const { myReports } = useReports();
  const [complaintSite, setComplaintSite] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <section className="mx-auto w-full max-w-2xl p-4 pb-28">
        <div className="eco-card text-center">
          <p className="font-display text-xl font-bold">Sign in to see your activity</p>
          <Button variant="outline" className="mt-3" onClick={() => onNavigate('account')}>Go to Account</Button>
        </div>
      </section>
    );
  }

  const summary = activityV1?.summary ?? myReports.reduce(
    (acc, report) => ({
      total_reports: acc.total_reports + 1,
      pii_protected: acc.pii_protected + (report.pii_blur_count > 0 ? 1 : 0),
      active_sites: acc.active_sites + (report.site_status !== 'cleaned' ? 1 : 0),
      cleaned_sites: acc.cleaned_sites + (report.site_status === 'cleaned' ? 1 : 0),
    }),
    { total_reports: 0, pii_protected: 0, active_sites: 0, cleaned_sites: 0 },
  );

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="activity-heading">
      <header>
        <p className="eco-label">Your impact</p>
        <h1 id="activity-heading" className="font-display text-3xl font-bold">My Activity</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Reports', summary.total_reports],
          ['PII protected', summary.pii_protected],
          ['Active sites', summary.active_sites],
          ['Cleaned', summary.cleaned_sites],
        ].map(([label, value]) => (
          <div key={String(label)} className="eco-card text-center">
            <p className="font-display text-2xl font-bold text-accent">{value}</p>
            <p className="text-[11px] font-semibold text-muted">{label}</p>
          </div>
        ))}
      </div>

      <ActivitySection onNavigateToMap={() => onNavigate('map')} />

      {complaintSite && (
        <ComplaintModal siteId={complaintSite} onClose={() => setComplaintSite(null)} />
      )}
    </section>
  );
}
