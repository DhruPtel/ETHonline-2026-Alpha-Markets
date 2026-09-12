// ⚠️ **The one treatment for anything the design shows and this build does not do.**
// Specified here once; every page imports it and none invents its own.
//
// **The rule: shown, obviously inert, unmistakable, and never a `<button>`.**
//
// ⚠️ **It is a `<span>`, never a `<button>`, `<a>` or `<input>`.** A disabled button invites a second
// click and reads as a temporary state — as *not working yet* rather than *not built*. There must be
// nothing to click, nothing to focus, and nothing that looks like it will wake up.
//
// ⚠️ **Full contrast, never greyed toward invisibility.** Something you cannot read does not
// communicate "unbuilt", it communicates "the CSS is broken".
//
// ⚠️ **What this is NOT for.** Not for empty data — a market with no stakes is *empty*, not unbuilt,
// and `.empty` already says so. Not for anything the contract forbids: a side picker marked
// "not built" would assert a roadmap that cannot exist without a different contract, so those are
// CUT and simply absent. The line is: **mark what a reviewer would think we forgot; cut what the
// contract forbids.**

export function Unbuilt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="unbuilt" aria-disabled="true" data-unbuilt={label}>
      <span className="unbuilt-inner" aria-hidden="true">{children}</span>
      {/* ⚠️ The label says what it WOULD do, in one clause. Never "coming soon" — this project
          does not promise. It is the accessible name as well as the visible one. */}
      <span className="unbuilt-tag">{label} — not built</span>
    </span>
  );
}
