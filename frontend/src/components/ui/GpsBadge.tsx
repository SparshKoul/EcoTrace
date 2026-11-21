import { RULES } from '../../config/rules';
import { useApp } from '../../state/AppContext';
import { Chip } from './Chip';

export function GpsBadge() {
  const { fix, gpsDenied, gpsLoading } = useApp();

  if (gpsDenied) return <Chip tone="bad">Location blocked</Chip>;
  if (!fix) return <Chip tone="warn">{gpsLoading ? 'Locating…' : 'No GPS fix'}</Chip>;

  const locked = fix.accuracyM <= RULES.GPS_MAX_ACCURACY_M;
  return (
    <Chip tone={locked ? 'accent' : 'warn'}>
      <span aria-hidden="true">{locked ? '●' : '○'}</span>
      GPS {Math.round(fix.accuracyM)} m · {locked ? 'locked' : `need ≤ ${RULES.GPS_MAX_ACCURACY_M} m`}
    </Chip>
  );
}
