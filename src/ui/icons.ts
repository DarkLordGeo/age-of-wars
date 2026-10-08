/**
 * Small inline SVG icons for the HUD menu (original drawings). 24x24 viewBox, `currentColor` for
 * the main shape so CSS controls the tint.
 */
const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS = {
  /** Category: train units (a figure with a club). */
  units: svg(
    '<circle cx="10" cy="5" r="3" fill="currentColor"/><path d="M5 22v-7l2-6h6l2 6v7h-3v-6h-4v6z" fill="currentColor"/><path d="M15 9l5-5 1.5 1.5-5 5z" fill="currentColor" opacity=".8"/>',
  ),
  /** Category: upgrades (stone hammer). */
  upgrades: svg(
    '<path d="M4 6l6-3 4 4-6 3z" fill="currentColor"/><path d="M9 9l2-1 9 11-2 2z" fill="currentColor" opacity=".85"/>',
  ),
  /** Evolve to the next age (star). */
  evolve: svg('<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor"/>'),
  /** Pause / game menu. */
  /** Turret: a small tower. */
  turret: svg('<path d="M6 22V10h12v12h-4v-5h-4v5z" fill="currentColor"/><path d="M5 10V5h3v2h2V5h4v2h2V5h3v5z" fill="currentColor" opacity=".8"/>'),
  /** Sell: coin with a minus. */
  sell: svg('<circle cx="12" cy="12" r="9" fill="currentColor"/><rect x="7" y="10.5" width="10" height="3" rx="1" fill="#2a1a08"/>'),
  /** Add slot: platform with a plus. */
  slot: svg('<rect x="3" y="16" width="18" height="5" rx="1" fill="currentColor"/><path d="M10.5 3h3v4.5H18v3h-4.5V15h-3v-4.5H6v-3h4.5z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'),
  /** Back to the category row. */
  back: svg('<path d="M14 5l-7 7 7 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  // Upgrades
  sharpened_weapons: svg('<path d="M4 20l10-10 2 2L6 22z" fill="currentColor"/><path d="M14 10l6-7 1 1-5 8z" fill="currentColor" opacity=".7"/>'),
  hardened_armor: svg('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/>'),
  reinforced_walls: svg(
    '<path d="M3 9h4V6h3v3h4V6h3v3h4v12H3z" fill="currentColor"/><path d="M3 14h18M10 9v5M14 14v7" stroke="#2a1a0c" stroke-width="1.2"/>',
  ),
  ballista_tuning: svg('<path d="M4 18L18 4" stroke="currentColor" stroke-width="2.5"/><path d="M18 4l-5 1 4 4z" fill="currentColor"/><path d="M5 9c4 1 9 6 10 10" stroke="currentColor" stroke-width="2" fill="none"/>'),
  trade_routes: svg('<circle cx="9" cy="10" r="6" fill="currentColor"/><circle cx="15" cy="15" r="6" fill="currentColor" opacity=".75"/>'),
} as const;

export function icon(id: string): string {
  return (ICONS as Record<string, string>)[id] ?? ICONS.upgrades;
}
