import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { useApp } from '../state/AppContext';

type Mode = 'login' | 'signup';

export function AccountPage() {
  const {
    user, signedIn, authLoading, online, notify,
    signInUser, signUpUser, signOutUser,
  } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') await signUpUser(email, password, fullName || undefined);
      else await signInUser(email, password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="account-heading">
      <header>
        <p className="eco-label">EcoTrace</p>
        <h1 id="account-heading" className="font-display text-3xl font-bold">Account</h1>
      </header>

      <div className="eco-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">Session</span>
          <Chip tone={signedIn ? 'accent' : 'neutral'}>
            {authLoading ? 'Checking…' : signedIn ? 'Signed in' : 'Signed out'}
          </Chip>
        </div>

        {authLoading && <p className="text-sm text-muted">Restoring your session…</p>}

        {!authLoading && user && (
          <div className="space-y-3">
            <p className="text-sm">
              Signed in as <strong>{user.fullName || user.email}</strong>
            </p>
            <p className="text-xs text-muted">{user.email}</p>
            <Button
              variant="outline"
              onClick={() => {
                void signOutUser().catch((cause: unknown) => {
                  notify(cause instanceof Error ? cause.message : 'Sign out failed.');
                });
              }}
            >
              Sign out
            </Button>
          </div>
        )}

        {!authLoading && !user && (
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <p className="text-sm text-muted">
              Create an account to submit reports and back sites. Accounts are real Supabase accounts —
              existing users must sign up through this app before they can sign in.
            </p>
            <div className="flex gap-2" role="tablist" aria-label="Account mode">
              {(['login', 'signup'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => { setMode(value); setError(null); }}
                  className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold ${mode === value ? 'bg-accent text-white' : 'bg-tile text-muted'}`}
                >
                  {value === 'login' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>
            {mode === 'signup' && (
              <label className="block">
                <span className="eco-label">Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            )}
            <label className="block">
              <span className="eco-label">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="eco-label">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b3261e]">
                {error}
              </p>
            )}
            <Button type="submit" variant="sun" disabled={busy} className="w-full">
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        )}
      </div>

      <div className="eco-card space-y-2">
        <h2 className="font-display text-xl font-bold">Connectivity</h2>
        <p className="text-sm text-muted">
          {online ? 'Online — reports can be submitted.' : 'Offline — capture still works, submission is blocked.'}
        </p>
      </div>

      <div className="eco-card space-y-2">
        <h2 className="font-display text-xl font-bold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Capture live evidence with a rear camera and a GPS fix under 30 m.</li>
          <li>The AI service blurs faces and plates, then verifies the waste stream.</li>
          <li>Sites within 20 m merge; boundaries resolve to ULB, MLA and MP.</li>
          <li>You review the cited complaint draft and choose whether to send it.</li>
        </ol>
      </div>
    </section>
  );
}
