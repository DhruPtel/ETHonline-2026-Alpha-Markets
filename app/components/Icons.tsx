/**
 * Inline SVG icons. Server components — no icon package, no client boundary.
 *
 * Every path is copied from the lucide icon the design exports used, so the
 * rendered glyphs are unchanged. Size defaults match the design's per-use
 * values; pass `size` to override. `strokeWidth` and the round caps are the
 * lucide defaults the stylesheet was drawn against.
 */
type IconProps = {size?: number; className?: string};

function Svg({size = 16, className, children}: IconProps & {children: React.ReactNode}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The Alpha Markets mark. Not a lucide icon — the brand glyph from the design. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M5 92 46 6 56 27 24 92ZM60 34 94 92 76 92 52 50Z" fill="currentColor" />
      <circle cx="50" cy="74" r="7" fill="currentColor" />
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Svg>;
export const ArrowLeft = (p: IconProps) => <Svg {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Svg>;
export const ArrowUpRight = (p: IconProps) => <Svg {...p}><path d="M7 7h10v10" /><path d="M7 17 17 7" /></Svg>;
export const ArrowDown = (p: IconProps) => <Svg {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const Check = (p: IconProps) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const CheckCircle = (p: IconProps) => <Svg {...p}><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></Svg>;
export const Clock = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>;
export const Database = (p: IconProps) => <Svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></Svg>;
export const FileText = (p: IconProps) => <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></Svg>;
export const Info = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Svg>;
export const Lock = (p: IconProps) => <Svg {...p}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
export const Maximize = (p: IconProps) => <Svg {...p}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" x2="14" y1="3" y2="10" /><line x1="3" x2="10" y1="21" y2="14" /></Svg>;
export const MessageSquare = (p: IconProps) => <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>;
export const Minus = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const Pencil = (p: IconProps) => <Svg {...p}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></Svg>;
export const Plus = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
export const RefreshCw = (p: IconProps) => <Svg {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></Svg>;
export const Search = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;
export const Terminal = (p: IconProps) => <Svg {...p}><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></Svg>;
export const Upload = (p: IconProps) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></Svg>;
export const Wallet = (p: IconProps) => <Svg {...p}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Svg>;
