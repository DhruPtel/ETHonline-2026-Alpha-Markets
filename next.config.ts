import type { NextConfig } from 'next';

// ⚠️ `tsconfigPath` is what keeps the root `tsconfig.json` intact. Next rewrites the tsconfig it is
// pointed at — adding its plugin, `moduleResolution: bundler`, and `.next/types` to `include` — and
// the root config is `NodeNext`, which every `.js`-suffixed import in `src/` and `scripts/` depends
// on. Pointing Next at its own file is the whole reason both halves of this repo typecheck.
const nextConfig: NextConfig = {
  typescript: { tsconfigPath: 'tsconfig.app.json' },
};

export default nextConfig;
