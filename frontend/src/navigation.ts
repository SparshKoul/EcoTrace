export type Tab = 'map' | 'report' | 'areas' | 'activity' | 'account';

export const TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'Map', icon: '◉' },
  { id: 'areas', label: 'Areas', icon: '▦' },
  { id: 'report', label: 'Report', icon: '◎' },
  { id: 'activity', label: 'Activity', icon: '≡' },
  { id: 'account', label: 'Account', icon: '☺' },
];
