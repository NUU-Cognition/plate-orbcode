import { Map as MapIcon } from 'lucide-react';
import { ConnectedApp } from './components/ConnectedApp';

// ── Standalone ──────────────────────────────────────────────────────

function StandaloneApp() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
          <MapIcon className="h-6 w-6 text-brand" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">OrbCode Map</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Open this plate inside Steel, or run with{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">?server=http://localhost:7433&plate=orbcode-map</code>{' '}
          to connect in dev mode.
        </p>
      </div>
    </main>
  );
}

// ── Root ─────────────────────────────────────────────────────────────

export function App({ connected }: { connected: boolean }) {
  return connected ? <ConnectedApp /> : <StandaloneApp />;
}
