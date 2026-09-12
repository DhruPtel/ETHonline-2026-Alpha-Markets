'use client';

// The Graph, in the console. ⚠️ **One query, shared by two slots that are not siblings.**
//
// The Source data tab lives in the light viewer; the Query Evidence block lives in the dark Atlas
// panel. They must show the same read, so the state is held in a context whose provider renders
// **no DOM element at all** — which is what lets it wrap the transcribed markup without changing the
// class-token sequence the console was checked at.
//
// ⚠️ **Nothing here invents a value.** The block number and the retrieval timestamp come off the
// subgraph's own `_meta` via `buildEvidence`, never off our clock. That is what makes the panel
// evidence rather than decoration.

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface Source {
  subgraph: string;
  subgraphId: string | null;
  network: string | null;
  revenueAvailability: string | null;
  hasIndexingErrors: boolean | null;
  row: Record<string, unknown> | null;
  evidence: {
    deployment: string; block: number; fetchedAt: string; rowCount: number | null;
    requestedBlock: number | null; documentHash: string; responseHash: string;
  };
}

type State = {
  data: Source | null;
  error: string | null;
  busy: boolean;
  read: (secret: string) => Promise<void>;
};

const Ctx = createContext<State | null>(null);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (secret: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/console/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-console-secret': secret },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      // ⚠️ 401 is a wrong secret; 500 is a secret absent or blank in the environment. The route's
      // guard runs `requiredEnv` before it compares, which is what keeps those two apart.
      if (res.status === 401) throw new Error('console secret rejected — check CONSOLE_SECRET');
      if (j.stop || j.fail) throw new Error(String(j.stop ?? j.fail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(j as Source);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return <Ctx.Provider value={{ data, error, busy, read }}>{children}</Ctx.Provider>;
}

export function useGraph(): State {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGraph outside GraphProvider');
  return c;
}

/** The secret, shared the same way — typed once in the Atlas panel, used by both fetches. */
const SecretCtx = createContext<{ secret: string; setSecret: (s: string) => void } | null>(null);
export function SecretProvider({ children }: { children: ReactNode }) {
  const [secret, setSecret] = useState('');
  return <SecretCtx.Provider value={{ secret, setSecret }}>{children}</SecretCtx.Provider>;
}
export function useSecret() {
  const c = useContext(SecretCtx);
  if (!c) throw new Error('useSecret outside SecretProvider');
  return c;
}
