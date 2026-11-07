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
:where(.stp-lt-bar){flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 0 8px}
:where(.stp-lt-select){font:inherit;max-width:100%;padding:6px 10px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:inherit}
:where(.stp-lt-button){font:inherit;padding:6px 12px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:inherit;cursor:pointer}
:where(.stp-lt-button:disabled){opacity:.5;cursor:default}
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
.stp-lt-marker__broke-down{position:absolute;left:5px;bottom:30px;width:18px;height:18px;box-sizing:border-box;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#d92d20;color:#fff;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none}
.stp-lt-marker__broke-down[hidden]{display:none}
.stp-lt-marker__broke-down svg{width:10px;height:10px;display:block;stroke-width:2.6}
.stp-lt-marker--broke-down .stp-lt-marker__badge{border-color:#d92d20}
.stp-lt-marker--broke-down .stp-lt-marker__badge::after{border-top-color:#d92d20}
.stp-lt-marker__label{position:absolute;left:22px;bottom:14px;white-space:nowrap;font:600 12px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${NAVY};background:rgba(255,255,255,.92);padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.stp-lt-marker--custom .stp-lt-marker__badge{bottom:4px;width:46px;height:46px;border:0;border-radius:0;background:transparent;box-shadow:none}
.stp-lt-marker--custom .stp-lt-marker__badge::after{display:none}
.stp-lt-marker__img{width:100%;height:100%;object-fit:contain;object-position:50% 100%;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));user-select:none;-webkit-user-drag:none}
.stp-lt-marker__dot{display:none}
.stp-lt-marker--custom .stp-lt-marker__dot{display:block;position:absolute;left:0;bottom:0;transform:translate(-50%,50%);width:10px;height:10px;box-sizing:border-box;border-radius:9999px;background:var(--stp-lt-ring,${NAVY});border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4)}
.stp-lt-marker--custom .stp-lt-marker__label{left:28px;bottom:18px}
.stp-lt-marker--custom .stp-lt-marker__broke-down{left:12px;bottom:38px}
.stp-lt-marker--custom.stp-lt-marker--broke-down .stp-lt-marker__img{filter:drop-shadow(0 0 2px #d92d20) drop-shadow(0 0 3px #d92d20)}
.stp-lt-marker--custom.stp-lt-marker--broke-down .stp-lt-marker__dot{background:#d92d20}
`;

/** Inject the stylesheet once per document. Safe to call from every mount. */
export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ELEMENT_ID;
  el.textContent = LIVE_TRACKER_CSS;
  doc.head.append(el);
}
