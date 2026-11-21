import { useApp } from '../../state/AppContext';

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-4 z-[1200] mx-auto max-w-md rounded-2xl border-2 border-ink bg-surface px-4 py-3 text-sm font-semibold shadow-[0_4px_0_#221c15]"
    >
      {toast}
    </div>
  );
}
