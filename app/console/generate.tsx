'use client';

// The generation control. Free to run, and the only one that takes ~50 seconds.
//
// ⚠️ **THROWAWAY. Delete `app/console/` and `app/api/console/` before submission.**
//
// ⚠️ **The stream is read line by line, and a stream that ends without a `done` event is reported as
// a truncation rather than as a finish.** That is the whole reason this is NDJSON and not a plain
// POST: when the function hits Vercel's 300s ceiling it is killed mid-response, and a client that
// just resolved the promise would show a run that stopped saying anything and call it over. Nothing
// is saved in that case — `save()` is the last step — so the message says so.

import { useState } from 'react';
import type { Log } from './terminal.js';

interface Event {
  t: number; stage: string; status?: string;
  [key: string]: unknown;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function Generate({ log, onSaved, busy, setBusy }: {
  log: Log; onSaved: (hash: string) => void; busy: boolean; setBusy: (b: boolean) => void;
}) {
  const [directive, setDirective] = useState('');

  const run = async () => {
    const asked = directive.trim();
    if (!asked || busy) return;
    setBusy(true);
    log.begin('generate', `"${asked}"`);

    try {
      const res = await fetch('/api/console/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directive: asked }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text();
        log.write('generate', `HTTP ${res.status} — ${detail.slice(0, 200)}`, 'bad');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawDone = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.trim()) continue;
          const e = JSON.parse(part) as Event;
          if (e.stage === 'done') sawDone = true;
          render(e, log, onSaved);
        }
      }

      if (!sawDone) {
        // ⚠️ The 300s cliff, or a dropped connection. Either way the run did not report a finish.
        log.write('truncated',
          'the stream ended without a `done` event — the function was killed or the connection dropped. ' +
          'Nothing was saved: save() is the last step, so the model tokens are spent and no report exists.',
          'bad');
      }
    } catch (error) {
      log.write('generate', error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      log.end();
      setBusy(false);
    }
  };

  return (
    <section className="op op-primary">
      <h2>Generate a report</h2>
      <p className="op-note">
        compose → execute → narrate → save. Costs model tokens, no HBAR. Roughly 50 seconds;
        <strong> execute stops itself at 240s</strong> and the function is killed at 300s.
      </p>
      <label className="field">
        <span>Directive</span>
        <textarea rows={3} value={directive} placeholder="Balance overview for Aave v3 on Ethereum"
          onChange={(e) => setDirective(e.target.value)} disabled={busy} />
      </label>
      <button type="button" className="go" onClick={run} disabled={busy || !directive.trim()}>
        {busy ? 'Running…' : 'Generate'}
      </button>
    </section>
  );
}

/** One stream event → one or more terminal lines. Kept out of `run` so the reader loop stays readable. */
function render(e: Event, log: Log, onSaved: (hash: string) => void): void {
  const at = secs(e.t);
  const say = (text: string, tone: Parameters<Log['write']>[2] = 'plain', href?: string, label?: string) =>
    log.write(e.stage, text, tone, href, label);

  switch (e.stage) {
    case 'limits':
      say(`analyst ${String(e.analyst)} · execute budget ${secs(Number(e.executeBudgetMs))} · function cap ${secs(Number(e.functionCapMs))}`, 'note');
      return;
    case 'compose':
      if (e.status === 'start') return say('planning…');
      if (e.status === 'ok') {
        const checks = (e.checks as string[]) ?? [];
        return say(`ok · ${String(e.headline)} · checks ${checks.join(', ') || 'none'}`, 'good');
      }
      say(`needs clarification — missing ${((e.missing as string[]) ?? []).join(', ')}`, 'warn');
      say(String(e.reason), 'warn');
      for (const s of (e.suggestions as string[]) ?? []) say(`try: "${s}"`, 'note');
      return;
    case 'execute':
      if (e.status === 'start') return say(`gathering… budget ${secs(Number(e.budgetMs))}`);
      if (e.status === 'ok') {
        const t = e.timings as Record<string, number>;
        say(`completed in ${secs(Number(e.elapsedMs))} · ${String(e.queries)} queries · block ${String(e.block)}`, 'good');
        return say(`fetch ${secs(t.fetchMs ?? 0)} · corroborate ${secs(t.corroborateMs ?? 0)} (${t.corroborateCalls ?? 0}) · engine ${secs(t.engineMs ?? 0)} · block ${secs(t.blockMs ?? 0)}`, 'note');
      }
      // blocked / declined / budget — three outcomes that are not a report, none of them saved.
      say(`${String(e.outcome)} after ${secs(Number(e.elapsedMs))} — ${String(e.detail)}`, 'warn');
      return;
    case 'narrate':
      if (e.status === 'start') return say('writing…');
      return say(`ok · ${String(e.facts)} facts · hash ${String(e.hash)}`, 'good');
    case 'validate':
      if (e.status === 'ok') return say('digit guard clean — every figure traces to a fact', 'good');
      say(`digit guard: ${String(e.count)} violation(s) — the report is saved anyway (warns, never blocks)`, 'warn');
      for (const v of (e.violations as string[]) ?? []) say(v, 'note');
      return;
    case 'save': {
      const hash = String(e.hash);
      say(`${e.inserted ? 'SAVED' : 'ALREADY STORED'} · ${String(e.facts)} facts · block ${String(e.block)} · ${String(e.markdownChars)} chars of markdown`, 'good');
      if (e.note) say(String(e.note), 'note');
      say(hash, 'plain', `/report/${hash}`, 'preview →');
      onSaved(hash);
      return;
    }
    case 'error':
      return say(String(e.detail), 'bad');
    case 'done':
      return say(e.saved ? 'finished' : 'finished — nothing was saved', e.saved ? 'good' : 'warn');
    default:
      say(JSON.stringify(e), 'note');
  }
}
