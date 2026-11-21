import { TABS, type Tab } from '../../navigation';

export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t-2 border-ink bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Main navigation">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onChange(tab.id)}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${selected ? 'text-accent' : 'text-muted'}`}
              >
                <span aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded-full text-lg ${tab.id === 'report' ? 'border-2 border-ink bg-sun text-ink' : selected ? 'bg-accent-soft' : ''}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
