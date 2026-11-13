/**
 * Static hero layout: no pin and no scroll animation. Used for visitors who
 * ask for reduced motion (wrapped in a media query) and when JavaScript does
 * not run (inside <noscript>). Kept as a string so both places share it.
 */
export const HERO_STATIC_CSS = `
.hx { --intro: 0; --reveal: 1; --ui: 0; --wipe: 0; --p: 0; }
.hx .hx-track { height: auto; }
.hx .hx-stage { position: relative; top: auto; }
.hx .hx-cards, .hx .hx-cue, .hx .hx-wipe { display: none; }
.hx .hx-copy { opacity: 1; transform: none; }
.hx .hx-info, .hx .hx-caption { opacity: 1; transform: translateX(-50%); }
.hx .hx-caption { transform: none; }
.hx .hx-word { transform: none; }
@media (max-width: 767px) {
  .hx { --dy0: -0.02; }
  .hx .hx-stage { height: auto; min-height: 0; display: flex; flex-direction: column; }
  .hx .hx-view { position: relative; inset: auto; height: 50svh; min-height: 340px; flex: none; }
  .hx .hx-copy { position: relative; inset: auto; order: 1; }
  .hx .hx-copy-panel { padding-top: 18px; }
  .hx .hx-rail { opacity: 1; position: relative; inset: auto; order: 2; transform: none; padding-top: 12px; padding-bottom: 12px; }
  .hx .hx-info { position: relative; inset: auto; left: auto; width: auto; transform: none; order: 3; padding: 0 16px 8px; }
  .hx .hx-caption { position: relative; inset: auto; order: 4; padding: 0 16px 20px; }
  .hx .hx-base { display: none; }
}
`;
