import { RULES } from '../config/rules';
import type { AreaScores, Site } from '../types';

const pct = (part: number, whole: number): number => (whole === 0 ? 100 : Math.round((part / whole) * 100));

/**
 * FR-2.5: diagnostic scores stay locked until the locality has enough distinct reporters.
 * Returning null is the lock; the UI must not show a partial score.
 */
export function computeAreaScores(sites: readonly Site[], reporterCount: number): AreaScores | null {
  if (reporterCount < RULES.MIN_VERIFIED_REPORTS) return null;

  const wasteSites = sites.filter((site) => site.type !== 'no_bin');
  const noBinSites = sites.filter((site) => site.type === 'no_bin');

  const resolved = sites.filter((site) => site.status === 'cleared' || site.status === 'closed').length;
  const persistent = sites.filter(
    (site) => site.status === 'open' || site.status === 'verified' || site.status === 'reopened',
  ).length;
  const clearing = pct(resolved, resolved + persistent);
  const citizenDumping = pct(wasteSites.filter((site) => site.nearBin).length, wasteSites.length);
  const binAccess = 100 - pct(noBinSites.length, sites.length);

  return {
    clearing,
    citizenDumping,
    binAccess: Math.max(0, Math.min(100, binAccess)),
  };
}

export function scoreTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 70) return 'good';
  if (score >= 40) return 'warn';
  return 'bad';
}

export const TONE_TEXT: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-accent',
  warn: 'text-[#9a6700]',
  bad: 'text-[#b3261e]',
};
