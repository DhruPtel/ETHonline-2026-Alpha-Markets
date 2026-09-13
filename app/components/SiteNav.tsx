'use client';

import {usePathname} from 'next/navigation.js';

/**
 * The main navigation. The only client component in the layout, and the one
 * place the active item is worked out — no page passes its own active flag in.
 *
 * Reports owns / and /report/[hash]; Markets owns /markets and /markets/[id];
 * Console owns /console; Analyst owns /analyst.
 *
 * ⚠️ **A FOURTH ITEM, AND THE REFERENCE ONLY EVER DREW THREE.** It uses the same markup and the
 * same `.active` treatment as the other three — no new class, no new look — because the shell is
 * not where accretion belongs. `/holdings` is absorbed into `/analyst` rather than sitting beside
 * it: a holdings item and an analyst item would be two answers to one question, *what does this
 * analyst own and how has it done*.
 *
 * ⚠️ **The fourth item is tight on a narrow phone and this file cannot fix it.** `.site-header` is
 * `grid-template-columns: 1fr auto 1fr` and the nav is the centre column, so four items fit
 * comfortably at every desktop width. Below 760px the nav drops to its own centred row at
 * `gap: 45px` — three items need roughly 265px and four need roughly 365px, against about 325px of
 * usable width on a 360px handset. **The gap is the thing to narrow, not the labels**, and
 * `globals.css` was out of this task's scope; it is reported rather than silently left.
 *
 * ⚠️ **Plain `<a href>`, never `next/link`, and there is no spelling of it that works here.**
 * `tsconfig.app.json` is `nodenext`, which it has to be — under Next's `bundler` default Turbopack
 * cannot resolve `src/`'s explicit `.js` specifiers, and every wiring commit imports `src/`. Under
 * nodenext, `next/link` fails to resolve at all and `next/link.js` resolves to the module object
 * rather than the component, because `next` ships no `exports` map and `link.js` is
 * `module.exports = require(...)`. Named imports are unaffected, which is why `next/navigation.js`
 * above is fine. The cost is a full page load per nav click; the alternative is a build that does
 * not compile.
 */
const NAV = [
  {href: '/console', label: 'Console', owns: (path: string) => path === '/console'},
  {href: '/', label: 'Reports', owns: (path: string) => path === '/' || path.startsWith('/report/')},
  {href: '/markets', label: 'Markets', owns: (path: string) => path.startsWith('/markets')},
  {href: '/analyst', label: 'Analyst', owns: (path: string) => path.startsWith('/analyst')},
] as const;

export function SiteNav() {
  const path = usePathname();

  return (
    <nav aria-label="Main navigation">
      {NAV.map(({href, label, owns}) => {
        const active = owns(path);
        return (
          <a key={href} href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
            {label}
          </a>
        );
      })}
    </nav>
  );
}
