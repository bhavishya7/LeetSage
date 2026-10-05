import React from 'react';
import { usageBand, fillFraction, BAND_COLOR, BAND_LABEL } from './usage-band';

/**
 * Chat Enhancement (E9) — the obscured usage indicator (design §6, R11).
 *
 * A small draining water-DROPLET glyph: the water level DROPS as the day's
 * requests climb. The metaphor is a finite reserve being used up — a natural fit
 * for the daily request budget, and free of the "context-window used" reading a
 * linear bar or ring would carry.
 *
 * The exact count moves to Settings (R11.3); here we show only a SIGNAL. The
 * "running low" cue (R11.2) is preserved as a color shift (calm → amber → red),
 * so the user still gets the "slow down" warning the number used to give — just
 * without a pressuring countdown now that one chat message can cost 2–3 requests.
 *
 * Accessible (R11.5): role="img" + an aria-label/title conveying the approximate
 * band, so obscuring the number is a VISUAL choice, not a loss of information.
 *
 * The pure band/fill math + color/label maps live in ./usage-band.ts (so this
 * file only exports a component — the react-refresh lint rule).
 */

interface UsageReservoirProps {
  used: number;
  max: number;
}

/**
 * A tiny WATER-DROPLET SVG — a droplet reads as "water" even at header size,
 * where a beaker outline collapsed into an unreadable box. The droplet DRAINS
 * from the bottom as the day's requests climb: a full teardrop at 0 requests, an
 * empty (outline-only) teardrop near the cap. The water fill is clipped to the
 * droplet silhouette and tinted calm→amber→red for the "running low" cue.
 *
 * Geometry: the droplet body spans roughly y∈[2,21] in a 16×24 viewBox. The
 * water is a rect whose TOP edge rises with the remaining fraction, clipped to
 * the teardrop path so it always reads as liquid inside the drop.
 */
const UsageReservoir: React.FC<UsageReservoirProps> = ({ used, max }) => {
  const band = usageBand(used, max);
  const remaining = fillFraction(used, max);
  const color = BAND_COLOR[band];
  const label = BAND_LABEL[band];
  const clipId = React.useId();

  // Classic teardrop: a pointed top at (8,1) flaring into a round bottom bulb.
  const DROP_PATH = 'M8 1 C8 1 2 9 2 14 A6 6 0 0 0 14 14 C14 9 8 1 8 1 Z';

  // Water fill spans the drop's vertical extent (y ~2 at the neck → ~20 bottom).
  const topY = 2;
  const bottomY = 20;
  const waterTop = bottomY - (bottomY - topY) * remaining;

  return (
    <span role="img" aria-label={label} title={label} className="inline-flex items-center shrink-0">
      {/* ~16px tall to sit flush with the emoji icon row; viewBox unchanged so
          the teardrop stays crisp. */}
      <svg width="11" height="16" viewBox="0 0 16 24" fill="none" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <path d={DROP_PATH} />
          </clipPath>
        </defs>
        {/* A faint full-drop tint so an empty drop still reads as a droplet. */}
        <path d={DROP_PATH} className="fill-neutral-200/60 dark:fill-neutral-700/50" />
        {/* The water level, clipped to the droplet silhouette. */}
        {remaining > 0 && (
          <rect
            x="0"
            y={waterTop}
            width="16"
            height={bottomY - waterTop + 2}
            fill={color}
            clipPath={`url(#${clipId})`}
          />
        )}
        {/* Droplet outline on top so the shape stays crisp at any fill level. */}
        <path
          d={DROP_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="text-neutral-400 dark:text-neutral-500"
        />
      </svg>
    </span>
  );
};

export default UsageReservoir;
