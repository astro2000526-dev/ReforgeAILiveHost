// ─────────────────────────────────────────────────────────────────────────────
// BrandMark — the Reforge AI Live logo mark.
//
// A rounded gold-gradient tile with a serif-italic "R" in ink, plus a small
// coral live-dot pulsing in the top-right corner. The dot is the brand
// signature: "an AI that's always live". A shimmer sweep runs across the tile
// on hover (see .brandmark / .brandmark-dot rules in globals.css).
//
// Used in AppHeader (replacing the plain wordmark) and the landing footer.
// Styling lives in globals.css so light/dark + reduced-motion are handled once.
// ─────────────────────────────────────────────────────────────────────────────

type BrandMarkProps = {
  /** Tile edge length in px. Default 32. */
  size?: number;
  /** Extra classes on the tile (e.g. spacing). */
  className?: string;
};

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <span
      className={`brandmark${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}
      aria-hidden="true"
    >
      R
      <span className="brandmark-dot" />
    </span>
  );
}
