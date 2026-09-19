// The package ships no CSS file: one <style> element, injected once and guarded
// by its id, carries the layout and the marker look. Every class is prefixed
// `stp-lt-` so nothing collides with the host page.
//
// Layout defaults sit inside :where() — zero specificity — so a consumer's
// `className` (or a `selectClassName`) always wins, whatever order the
// stylesheets land in. Marker rules keep normal specificity: the marker DOM is
// ours alone.

export const STYLE_ELEMENT_ID = 'stp-lt-styles';

const NAVY = '#0f2747';

export const LIVE_TRACKER_CSS = `
:where(.stp-lt){position:relative;display:flex;flex-direction:column;width:100%;height:480px;box-sizing:border-box;font-family:inherit;color:${NAVY}}
:where(.stp-lt-bar){flex:0 0 auto;padding:0 0 8px}
:where(.stp-lt-select){font:inherit;max-width:100%;padding:6px 10px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:inherit}
:where(.stp-lt-stage){position:relative;flex:1 1 auto;min-height:0;border-radius:12px;overflow:hidden;background:#eef2f6}
:where(.stp-lt-map){position:absolute;inset:0}
.stp-lt-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.stp-lt-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:none}
.stp-lt-overlay__msg{max-width:28em;padding:10px 16px;border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 1px 4px rgba(0,0,0,.25);font-size:14px;font-weight:600;line-height:1.4;text-align:center;color:${NAVY}}
.stp-lt-panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#f2f4f7;font-size:15px;line-height:1.5;text-align:center;color:#475467}
.stp-lt-error{box-sizing:border-box;padding:12px 16px;border:1px solid #fda29b;border-radius:8px;background:#fef3f2;color:#b42318;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:left}
.stp-lt-panel .stp-lt-error{max-width:40em}

.stp-lt-marker{position:relative;width:0;height:0;transition:opacity .3s}
.stp-lt-marker--quiet{opacity:.6}
.stp-lt-marker__badge{position:absolute;left:0;bottom:6px;transform:translateX(-50%);width:34px;height:34px;box-sizing:border-box;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#fff;border:3px solid var(--stp-lt-ring,${NAVY});color:${NAVY};box-shadow:0 1px 4px rgba(0,0,0,.35)}
.stp-lt-marker__badge::after{content:'';position:absolute;left:50%;bottom:-10px;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid var(--stp-lt-ring,${NAVY})}
.stp-lt-marker__badge svg{width:20px;height:20px;display:block}
.stp-lt-marker__heading{position:absolute;left:-17px;bottom:6px;width:34px;height:34px;pointer-events:none;transition:transform .4s ease}
.stp-lt-marker__heading[hidden]{display:none}
.stp-lt-marker__heading::before{content:'';position:absolute;left:50%;top:-9px;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid var(--stp-lt-ring,${NAVY});filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
.stp-lt-marker__label{position:absolute;left:22px;bottom:14px;white-space:nowrap;font:600 12px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${NAVY};background:rgba(255,255,255,.92);padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
@media (prefers-reduced-motion:reduce){.stp-lt-marker,.stp-lt-marker__heading{transition:none}}
`;

/** Inject the stylesheet once per document. Safe to call from every mount. */
export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ELEMENT_ID;
  el.textContent = LIVE_TRACKER_CSS;
  doc.head.append(el);
}
