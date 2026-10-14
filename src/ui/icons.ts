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

/**
 * Gold coin for the purse (full colour, unlike the tinted ICONS): a slightly worn, beaded rim, a
 * gradient face with a highlight, and a sun stamped into it (dark sun plus a light lip offset down
 * and right, so it reads as engraved). The rim outline and the solid sun keep it readable at 13 px.
 */
export const COIN = `<svg viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="aow-coin-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".45" stop-color="#d9a032"/><stop offset="1" stop-color="#7d4f0c"/></linearGradient>
<radialGradient id="aow-coin-face" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff4c2"/><stop offset=".3" stop-color="#f6cf5e"/><stop offset=".72" stop-color="#e0a52c"/><stop offset="1" stop-color="#a86f14"/></radialGradient>
<radialGradient id="aow-coin-shine" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<path d="M31.4 16L31.27 18.01L30.88 19.99L30.22 21.89L29.31 23.69L28.12 25.3L26.69 26.69L25.16 27.94L23.58 29.13L21.86 30.15L19.98 30.86L18.01 31.27L16 31.4L13.99 31.27L12.01 30.88L10.11 30.23L8.3 29.34L6.63 28.22L5.15 26.85L4.01 25.2L3.05 23.48L1.96 21.82L1.15 19.98L0.73 18.01L0.6 16L0.73 13.99L1.13 12.01L1.78 10.11L2.69 8.31L3.86 6.68L5.26 5.26L6.8 4.02L8.44 2.9L10.17 1.92L12.03 1.19L13.99 0.75L16 0.6L18.01 0.73L19.99 1.12L21.89 1.77L23.69 2.67L25.27 3.91L26.61 5.39L28.08 6.73L29.32 8.31L30.23 10.11L30.88 12.01L31.27 13.99Z" fill="url(#aow-coin-rim)" stroke="#4a2e06" stroke-width=".8"/>
<circle cx="16" cy="16" r="14" fill="none" stroke="#8a5a12" stroke-width="1.1" stroke-dasharray=".01 2.2" stroke-linecap="round" opacity=".55"/>
<circle cx="16" cy="16" r="12.6" fill="url(#aow-coin-face)" stroke="#7a4c0e" stroke-width=".9"/>
<path d="M27.84 20.31A12.6 12.6 0 0 1 20.31 27.84" fill="none" stroke="#fff2b8" stroke-width=".7" opacity=".6"/>
<g transform="translate(.55 .55)" fill="#fff0b0" opacity=".6"><circle cx="16" cy="16" r="3.9"/><path d="M15.03 11.2L16 7.1L16.97 11.2ZM17.7 11.4L19.7 9.59L19.13 12.23ZM19.67 12.76L23.71 11.55L20.65 14.44ZM20.83 15.17L23.4 16L20.83 16.83ZM20.65 17.56L23.71 20.45L19.67 19.24ZM19.13 19.77L19.7 22.41L17.7 20.6ZM16.97 20.8L16 24.9L15.03 20.8ZM14.3 20.6L12.3 22.41L12.87 19.77ZM12.33 19.24L8.29 20.45L11.35 17.56ZM11.17 16.83L8.6 16L11.17 15.17ZM11.35 14.44L8.29 11.55L12.33 12.76ZM12.87 12.23L12.3 9.59L14.3 11.4Z"/></g>
<g fill="#8a5510"><circle cx="16" cy="16" r="3.9"/><path d="M15.03 11.2L16 7.1L16.97 11.2ZM17.7 11.4L19.7 9.59L19.13 12.23ZM19.67 12.76L23.71 11.55L20.65 14.44ZM20.83 15.17L23.4 16L20.83 16.83ZM20.65 17.56L23.71 20.45L19.67 19.24ZM19.13 19.77L19.7 22.41L17.7 20.6ZM16.97 20.8L16 24.9L15.03 20.8ZM14.3 20.6L12.3 22.41L12.87 19.77ZM12.33 19.24L8.29 20.45L11.35 17.56ZM11.17 16.83L8.6 16L11.17 15.17ZM11.35 14.44L8.29 11.55L12.33 12.76ZM12.87 12.23L12.3 9.59L14.3 11.4Z"/></g>
<circle cx="16" cy="16" r="1.7" fill="#c98d24"/>
<ellipse cx="11.5" cy="9.5" rx="7" ry="4.2" transform="rotate(-35 11.5 9.5)" fill="url(#aow-coin-shine)"/>
<path d="M2 10.9A14.9 14.9 0 0 1 10.9 2" fill="none" stroke="#fffbe0" stroke-width="1" stroke-linecap="round" opacity=".7"/>
</svg>`;

export function icon(id: string): string {
  return (ICONS as Record<string, string>)[id] ?? ICONS.upgrades;
}
