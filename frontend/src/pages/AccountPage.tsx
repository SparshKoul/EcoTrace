import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { useApp } from '../state/AppContext';

export function AccountPage() {
  const { signedIn, setSignedIn, online, notify } = useApp();
  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="account-heading">
      <header>
        <p className="eco-label">EcoTrace</p>
        <h1 id="account-heading" className="font-display text-3xl font-bold">Account</h1>
      </header>

      <div className="eco-card space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">Session</span>
          <Chip tone={signedIn ? 'accent' : 'neutral'}>{signedIn ? 'Signed in' : 'Signed out'}</Chip>
        </div>
        <p className="text-sm text-muted">
          Signing in is required to submit reports and vote on sites. In this frontend-only preview the session is local.
        </p>
        <Button variant="outline" onClick={() => { setSignedIn(!signedIn); notify(signedIn ? 'Signed out locally.' : 'Signed in locally.'); }}>
          {signedIn ? 'Sign out' : 'Sign in'}
        </Button>
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
