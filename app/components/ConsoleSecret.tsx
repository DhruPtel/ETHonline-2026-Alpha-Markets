'use client';

// The console doorlock's browser half — one value, shared by two panels that are not siblings.
//
// ⚠️ **`CONSOLE_SECRET` is typed by a human and never built into anything.**
// `NEXT_PUBLIC_CONSOLE_SECRET` would be inlined into the client bundle at build time and served to
// every visitor, which is not a secret but a string in a `<script>` tag. The value exists only in
// the environment (server side) and in the operator's head (browser side), and the two meet in the
// `x-console-secret` header. `app/api/console/lock.ts` carries the rest of the reasoning, including
// the honest limit: this works only because a human is at the keyboard.
//
// ⚠️ **THE PROVIDER RENDERS NO DOM ELEMENT AT ALL**, and that is the whole reason it exists rather
// than the state living in one panel. The field is in the dark Atlas panel; the Source data tab that
// needs the same value is in the light viewer. They are in different subtrees, so the value cannot
// be lifted into either one — and a wrapper `<div>` here would insert an element into markup that
// was transcribed from the design and is checked against it token for token.
// `trash/app/console/graph.tsx` solved it this way and this is the same shape.

import {createContext, useContext, useState, type ReactNode} from 'react';

type Secret = {secret: string; setSecret: (s: string) => void};

const Ctx = createContext<Secret | null>(null);

export function SecretProvider({children}: {children: ReactNode}) {
  const [secret, setSecret] = useState('');
  return <Ctx.Provider value={{secret, setSecret}}>{children}</Ctx.Provider>;
}

export function useSecret(): Secret {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSecret outside SecretProvider');
  return c;
}

/**
 * The field itself. ⚠️ **It lives inside the Atlas panel, above the composer it gates** — not in a
 * section of its own above the workspace. `logs.md` records why: putting it above the workspace is
 * precisely how the reference layout ended up inserted into the old console rather than replacing
 * it. It gates Generate, Generate is in this panel, so the field belongs in this panel.
 */
export function SecretField() {
  const {secret, setSecret} = useSecret();
  return (
    <label className="field-label" htmlFor="console-secret">
      CONSOLE_SECRET
      <input
        id="console-secret"
        className="field"
        type="password"
        value={secret}
        autoComplete="off"
        spellCheck={false}
        placeholder="operator secret"
        onChange={(e) => setSecret(e.target.value)}
      />
    </label>
  );
}
