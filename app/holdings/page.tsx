// `/holdings` is absorbed into `/analyst`. This file is the redirect that keeps the URL working.
//
// ── ⚠️ WHY THE OLD PAGE WAS REMOVED RATHER THAN LEFT UNLINKED ────────────────────────────────────
//
// PHASE-7 §3 decided `/holdings` would "keep working as a URL and simply not be linked". **That was
// decided believing the page was real. It was not.** It rendered a `HOLDINGS` const of three
// invented report tokens — hashes `3d81e6f09c24ab75`, `9f2c4a7e1b8d3056`, `e4a1b26d70f5c839`, an
// account `0x7a3f…c218`, an author "Atlas Research", and market claims about Aave revenue and
// stablecoin growth that no market in this project has ever asked. The route table listed it `○`
// static, which is itself the tell: a page that reads the store cannot be prerendered.
//
// ⚠️ **Leaving that unlinked would have left fabricated financial content live on a public site**,
// reachable by URL and indistinguishable from the real pages around it. Unlinking hides a thing from
// navigation; it does not stop it being served. So the plan is amended here: the demo page is gone,
// and `/holdings` sends its visitors to the page that answers the same question with real data.
//
// ⚠️ **A redirect rather than a delete**, so nothing 404s — an old link or bookmark lands on the
// real holdings section instead of an error. 308, because this move is permanent.
//
// ⚠️ `app/api/holdings/route.ts` is untouched and still works. It was always real — mirror node,
// `report_tokens`, `balanceOf` — and it is a product API that happens now to have no page calling
// it, because `/analyst` reads the store and the chain directly rather than fetching a route the
// same server serves. Deleting it was not this task's to do.

import {permanentRedirect} from 'next/navigation.js';

export default function Holdings(): never {
  permanentRedirect('/analyst');
}
