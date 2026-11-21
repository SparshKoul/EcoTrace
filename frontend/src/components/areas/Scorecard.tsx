import { RULES } from '../../config/rules';
import { scoreTone, TONE_TEXT } from '../../domain/scores';
import type { Area, AreaScores, Site } from '../../types';
import { Chip } from '../ui/Chip';

export function ScoreBars({ scores }: { scores: AreaScores }) {
  const rows: readonly [string, number, string][] = [
    ['City clearing', scores.clearing, 'Resolved versus persistent or reopened sites'],
    ['Citizen dumping', scores.citizenDumping, 'Dumping despite a nearby dustbin'],
    ['Bin access', scores.binAccess, 'Demand for bins within 1 km'],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([label, value, hint]) => (
        <div key={label}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">{label}</span>
            <span className={`font-display text-xl font-bold ${TONE_TEXT[scoreTone(value)]}`}>{value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-tile">
            <div
              className={`h-full rounded-full ${scoreTone(value) === 'good' ? 'bg-accent' : scoreTone(value) === 'warn' ? 'bg-sun' : 'bg-[#b3261e]'}`}
              style={{ width: `${value}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
      ))}
    </div>
  );
}

export function AreaCard({ area }: { area: Area }) {
  const remaining = Math.max(0, RULES.MIN_VERIFIED_REPORTS - area.reporterCount);
  return (
    <article className="eco-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold">{area.name}</h3>
          <p className="text-xs text-muted">{area.ulb ?? 'Boundary pending verification'}</p>
        </div>
        <Chip tone={area.reporterCount >= RULES.MIN_VERIFIED_REPORTS ? 'accent' : 'neutral'}>
          {area.reporterCount} reporters
        </Chip>
      </div>
      <p className="text-xs text-muted">
        {area.mla ?? 'MLA seat pending'} · {area.mp ?? 'MP seat pending'}
      </p>
      {area.scores ? (
        <ScoreBars scores={area.scores} />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-line bg-tile p-4 text-center">
          <p className="font-display text-lg font-bold">Scorecards unlock at {RULES.MIN_VERIFIED_REPORTS} reporters</p>
          <p className="mt-1 text-sm text-muted">
            {remaining} more distinct {remaining === 1 ? 'reporter' : 'reporters'} needed. Partial scores are never shown.
          </p>
        </div>
      )}
    </article>
  );
}

/** Compact version used when a map pin asks for the locality behind it. */
export function LocalityPanel({ site, areas }: { site: Site; areas: readonly Area[] }) {
  const match = areas.find((area) => (area.ulb && area.ulb === site.boundary.ulb) || area.name === site.boundary.mla?.split(' ')[0]);
  const reporterCount = match?.reporterCount ?? site.reporterCount;
  const remaining = Math.max(0, RULES.MIN_VERIFIED_REPORTS - reporterCount);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {site.boundary.ulb ?? 'ULB pending'} · {site.boundary.mla ?? 'MLA pending'} · {site.boundary.mp ?? 'MP pending'}
      </p>
      {match?.scores ? (
        <ScoreBars scores={match.scores} />
      ) : (
        <p className="rounded-2xl bg-tile p-4 text-sm font-semibold">
          Locality scorecards unlock after {RULES.MIN_VERIFIED_REPORTS} distinct reporters. {remaining} to go.
        </p>
      )}
    </div>
  );
}
