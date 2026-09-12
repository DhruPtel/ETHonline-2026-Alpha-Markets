'use client';

// The three controls that spend HBAR: tokenize, transfer, buy.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **Two clicks, and the second one is not enabled until the first has returned a plan.** Plan
// posts without `confirm` and the route sends nothing; only then does the spend button arm. It
// disarms the moment any input changes, because a plan drawn for one report is not permission to
// spend on another.
//
// ⚠️ **This is the convenience half of the confirm, not the control.** The control is server-side —
// each route ignores everything unless the body carries `confirm: true` — and that is what makes the
// step survive a mis-click, a stale tab or a hand-written request. The disabled attribute here is
// only what stops the mis-click reaching it.
//
// ⚠️ The three routes deliberately answer in the same shape — `stop` / `fail` / `mode` / `plan` /
// `checks` / `cost` / `links` — so one renderer reads all three and the per-operation part stays
// small enough to see.

import { useEffect, useState, type ReactNode } from 'react';
import type { Log, Tone } from './terminal.js';
import type { ConsoleDoc } from './document.js';

type Json = Record<string, unknown>;

/**
 * ⚠️ **The console secret rides on every console POST, and it is sent rather than stored.** It comes
 * from a field the operator types into — nothing here is built into the bundle, because a
 * `NEXT_PUBLIC_` value is served to every visitor and is therefore not a secret. See
 * `app/api/console/lock.ts`.
 *
 * ⚠️ It is sent even to routes that do not check it — `/api/buy` is product and deliberately
 * unlocked. A per-path allowlist in the client would be a second copy of the server's decision about
 * which routes are locked, and the two would drift. Same origin, nothing logs it.
 */
const post = async (path: string, body: Json, secret: string): Promise<{ status: number; json: Json }> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-console-secret': secret },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
};

/**
 * Key/value lines, so "what was sent" is on screen rather than implied.
 *
 * ⚠️ The `→` prefix is not decoration. The request body and the plan that comes back share keys, so
 * without it the transcript shows `reportHash` twice with no way to tell which one is the thing that
 * was asked for and which is the thing the server agreed to.
 */
const dump = (log: Log, stage: string, value: unknown, tone: Tone = 'note', prefix = ''): void => {
  for (const [k, v] of Object.entries((value ?? {}) as Json)) {
    log.write(stage, `${prefix}${k.padEnd(18)} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`, tone);
  }
};

interface SpendProps {
  readonly id: string;
  readonly title: string;
  readonly cost: string;
  readonly note: ReactNode;
  readonly path: string;
  /** ⚠️ Typed by the operator, held in `Panel`'s state, never persisted and never built in. */
  readonly secret: string;
  /** The request body, minus `confirm`. `null` means the inputs are not complete yet. */
  readonly body: () => Json | null;
  /** Everything that must be identical between the plan and the spend for the arming to hold. */
  readonly armKey: string;
  readonly fields?: ReactNode;
  /** Operation-specific lines, run after the common renderer on a confirmed response. */
  readonly extra?: (json: Json, log: Log) => void;
  readonly log: Log;
  readonly busy: boolean;
  readonly setBusy: (b: boolean) => void;
  readonly onDone: () => void;
}

export function Spend(props: SpendProps) {
  const { id, title, cost, note, path, secret, body, armKey, fields, extra, log, busy, setBusy, onDone } = props;
  const [armed, setArmed] = useState(false);

  // ⚠️ Any change to what the operation targets revokes the arming.
  useEffect(() => { setArmed(false); }, [armKey]);

  const run = async (confirm: boolean) => {
    const payload = body();
    if (!payload || busy) return;
    setBusy(true);
    log.begin(id, confirm ? `CONFIRMED — spending ~${cost}` : 'plan (nothing is sent)');

    try {
      const { status, json } = await post(path, { ...payload, ...(confirm ? { confirm: true } : {}) }, secret);
      dump(log, id, payload, 'plain', '→ ');

      if (json.stop) { log.write(id, `STOP  ${String(json.stop)}`, 'warn'); setArmed(false); return; }
      if (json.error) { log.write(id, `HTTP ${status} — ${String(json.error)}`, 'bad'); return; }
      if (json.refused) {
        const r = json.refused as { control: string; message: string };
        log.write(id, `REFUSED by "${r.control}" — ${r.message}`, 'warn');
        return;
      }
      if (json.fail) {
        log.write(id, `FAIL  ${String(json.fail)}`, 'bad');
        if (json.guidance) log.write(id, String(json.guidance), 'warn');
        return;
      }

      if (json.plan) dump(log, id, json.plan);

      if (json.mode === 'dry') {
        log.write(id, `DRY RUN — nothing was sent. The spend button is now armed for ~${cost}.`, 'note');
        setArmed(true);
        return;
      }

      for (const c of (json.checks as { ok: boolean; label: string; detail: string }[]) ?? []) {
        log.write(id, `${c.ok ? '✅' : '❌'} ${c.label}  ${c.detail}`, c.ok ? 'good' : 'bad');
      }
      if (json.result) dump(log, id, json.result, 'plain');
      if (json.cost) dump(log, id, json.cost, 'note');
      extra?.(json, log);
      for (const [label, href] of Object.entries((json.links ?? {}) as Record<string, string>)) {
        if (href.startsWith('http') || href.startsWith('/')) log.write(id, label, 'plain', href, href);
        else log.write(id, `${label}  ${href}`, 'note');
      }
      setArmed(false);
      onDone();
    } catch (error) {
      log.write(id, error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      log.end();
      setBusy(false);
    }
  };

  const ready = body() !== null;
  return (
    <section className="op op-spend">
      <h2>{title}</h2>
      <p className="op-note">{note}</p>
      {fields}
      <div className="two-step">
        <button type="button" className="plan" onClick={() => run(false)} disabled={busy || !ready}>
          Plan
        </button>
        <button type="button" className="go spend" onClick={() => run(true)} disabled={busy || !armed}>
          {armed ? `Confirm — spend ~${cost}` : `Plan first (~${cost})`}
        </button>
      </div>
    </section>
  );
}

/**
 * The buy response carries three things no other operation does.
 *
 * ⚠️ **A factory now, because the purchased body has somewhere to go.** It used to print four table
 * lines into the terminal and discard the markdown — so the artefact the payment existed to buy was
 * the one thing the console could not show you. `onDoc` hands it to the document pane.
 */
export const buyExtra = (onDoc: (doc: ConsoleDoc) => void) => (json: Json, log: Log): void => {
  for (const e of (json.trace as Json[]) ?? []) {
    log.write('buy', `${String(e.event)}  ${JSON.stringify(e)}`, 'note');
  }
  const body = json.body as { hashMatchesRequested: boolean; markdownChars: number; tableLines: string[]; figure: string | null; markdown?: string } | undefined;
  const purchase = json.purchase as { paymentId?: string; amountHbar?: string; payTo?: string; settledTransaction?: string } | undefined;
  const plan = json.plan as { url?: string } | undefined;
  if (body) {
    log.write('buy', `hash in body matches requested: ${body.hashMatchesRequested}`, body.hashMatchesRequested ? 'good' : 'bad');
    log.write('buy', `markdown ${body.markdownChars} chars — the half the preview page does not serve`, 'good');
    for (const line of body.tableLines) log.write('buy', line.slice(0, 110), 'plain');
    log.write('buy', `a figure from it: ${body.figure ?? '(none found)'}  ← grep the public page for this`, 'note');

    // ⚠️ The fix: render what was paid for, rather than describing it.
    if (body.markdown) {
      const hash = (json.body as Json & { hash?: string }).hash
        ?? plan?.url?.split('/').pop() ?? '';
      onDoc({
        source: 'paid',
        reportHash: String(hash),
        markdown: body.markdown,
        figure: body.figure,
        facts: [
          ['paid', `${purchase?.amountHbar ?? '?'} HBAR to ${purchase?.payTo ?? '?'}`],
          ['payment id', purchase?.paymentId ?? '—'],
          ['settled', purchase?.settledTransaction ?? '—'],
          ['body', `${body.markdownChars} chars`],
        ],
      });
      log.write('buy', 'body rendered below — this is the document the payment bought', 'good');
    }
  }
  const moved = json.moved as Json | undefined;
  if (moved?.transfers) {
    log.write('buy', `on-chain result ${String(moved.result)} · network fee ${String(moved.networkFeeHbar)} paid by ${String(moved.feeBearer)}`, 'good');
    for (const t of moved.transfers as { account: string; amount: number }[]) {
      log.write('buy', `  ${t.account.padEnd(14)} ${t.amount > 0 ? '+' : ''}${t.amount}`, 'plain');
    }
  } else if (moved?.note) {
    log.write('buy', String(moved.note), 'warn');
  }
  for (const r of (json.refusals as { label: string; refused: boolean; control: string | null; detail: string }[]) ?? []) {
    log.write('buy', `${r.refused ? '✅' : '⛔'} ${r.label} — ${r.refused ? `refused by "${r.control}"` : 'NOT refused'}`,
      r.refused ? 'good' : 'bad');
  }
};
