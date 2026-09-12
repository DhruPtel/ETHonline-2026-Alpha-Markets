'use client';

import {usePathname} from 'next/navigation.js';

/**
 * The main navigation. The only client component in the layout, and the one
 * place the active item is worked out — no page passes its own active flag in.
 *
 * Reports owns / and /report/[hash]; Markets owns /markets and /markets/[id];
 * Console owns /console. /holdings matches nothing and highlights nothing.
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
