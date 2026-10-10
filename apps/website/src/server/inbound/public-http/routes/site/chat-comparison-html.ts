/** Native document boundaries isolate both real bundles, including runtime-injected React styles. */
export function renderSiteChatComparisonFrame({ variant }: { variant: "react" | "vanilla" }, _options = {}): string {
  const asset = variant === "vanilla" ? "site-assistant-vanilla" : "site-assistant";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${variant === "vanilla" ? "Lightweight" : "React"} widget</title>
<link rel="stylesheet" href="/site-chat/${asset}.css">
<style>body{margin:0;background:#f6f7fa;font:14px system-ui;color:#272c36}main{padding:24px}h1{font-size:18px}a{color:#a85a38}</style></head><body>
<main><h1>Site assistant preview</h1><p>The same site, assistant, and published content in both panes.</p><h2>Comparison target</h2><p>Use this heading to compare highlight and scroll actions.</p></main>
<div id="tovu-site-assistant-root" data-chat-open="true" data-chat-compare="${variant}"></div>
<script defer src="/site-chat/${asset}.js"></script></body></html>`;
}

/** Product-specific comparison controls. No site setting is changed by opening this document. */
export function renderSiteChatComparisonPage(_input: Record<string, never>, _options = {}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare site chat widgets</title><style>
:root{color-scheme:light;--primary:#a85a38;--border:#dfe2e8;--fg:#272c36;--surface:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--fg);font:14px/1.5 "DM Sans",system-ui,sans-serif}
main{padding:24px;max-width:1400px;margin:auto}h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:0 0 8px}
form{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:20px 0}.field{flex:1;min-width:220px}label{display:block;margin-bottom:6px}
textarea{width:100%;resize:vertical;min-height:70px}textarea,select,button{font:inherit;border:1px solid var(--border);border-radius:7px;padding:8px 12px;background:var(--surface);color:var(--fg)}
button{background:var(--primary);color:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}:focus-visible{outline:3px solid var(--primary);outline-offset:3px}
.panes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.pane{min-width:0}.viewport{overflow-x:auto;border:1px solid var(--border);border-radius:11px;background:#f6f7fa}
iframe{display:block;width:100%;height:740px;border:0}.panes[data-width="mobile"] iframe{width:375px;max-width:none;margin:auto}
.status{min-height:24px}details{margin:20px 0}a{color:var(--primary)}@media(max-width:800px){main{padding:16px}.panes{grid-template-columns:1fr}}
</style></head><body><main>
<p>Development · Visitor AI Assistant</p><h1>Compare site chat widgets</h1>
<p>Both panes use this site's assistant. Each keeps its own thread. Replies may vary; compare layout, streaming, links, reset, and page actions.</p>
<form id="compare-form"><div class="field"><label for="compare-message">Message for both widgets</label><textarea id="compare-message" maxlength="8000" required placeholder="Ask about this site's posts and pages…"></textarea></div>
<div><label for="compare-width">Pane width</label><select id="compare-width"><option value="desktop">Desktop</option><option value="mobile">375px</option></select></div>
<button id="compare-send" disabled>Send the same message to both</button></form>
<p id="compare-status" class="status" role="status" aria-live="polite">Loading both widgets…</p>
<div id="compare-panes" class="panes" data-width="desktop">
<section class="pane"><h2>React (default)</h2><div class="viewport"><iframe title="React widget" data-chat-compare="react" src="/__compare/site-chat/react"></iframe></div></section>
<section class="pane"><h2>Lightweight (beta)</h2><div class="viewport"><iframe title="Lightweight widget" data-chat-compare="vanilla" src="/__compare/site-chat/vanilla"></iframe></div></section></div>
<details><summary>Remaining parity gaps</summary><ul><li>Draggable bubble: React supports dragging; Lightweight stays anchored.</li><li>Syntax colouring: Lightweight renders safe code blocks without highlighting.</li><li>Rich event cards: Lightweight streams text and page actions; React also renders rich event cards.</li><li>Header/composer chrome and reset confirmation focus still differ. Check keyboard reset in both panes before switching.</li></ul></details>
<p>Keep the visitor assistant enabled and its provider configured before sending. Change the site widget in <a href="/admin/ai-assistant?tab=visitor">Visitor's AI Assistant settings</a>.</p>
</main><script>
(() => {
  const form = document.getElementById('compare-form');
  const button = document.getElementById('compare-send');
  const status = document.getElementById('compare-status');
  const frames = Array.from(document.querySelectorAll('iframe'));
  const message = document.getElementById('compare-message');
  let sending = false;
  const ready = () => frames.every(frame => frame.contentDocument?.getElementById('tovu-site-assistant-root')?.dataset.compareReady === 'true');
  const refresh = () => { if (!sending) { button.disabled = !ready(); status.textContent = ready() ? 'Both widgets ready.' : 'Loading widgets…'; } };
  window.addEventListener('message', event => {
    if (event.origin === location.origin && frames.some(frame => frame.contentWindow === event.source) && event.data?.type === 'tovu-site-chat-ready') refresh();
  });
  frames.forEach(frame => frame.addEventListener('load', refresh));
  document.getElementById('compare-width').addEventListener('change', event => { document.getElementById('compare-panes').dataset.width = event.target.value; });
  function send(frame, text) {
    return new Promise((resolve, reject) => {
      const root = frame.contentDocument.getElementById('tovu-site-assistant-root');
      let settled = false;
      const finish = (error, outcome = 'reply complete') => {
        if (settled) return;
        settled = true; clearTimeout(timeout); frame.removeEventListener('load', navigated);
        error ? reject(new Error(error)) : resolve(outcome);
      };
      const navigated = () => finish(undefined, 'page navigated');
      const timeout = setTimeout(() => finish('Reply timed out. Check this pane.'), 120000);
      frame.addEventListener('load', navigated);
      root.dispatchEvent(new frame.contentWindow.CustomEvent('tovu-compare-send', { detail: { text, done: error => {
        finish(error);
      } } }));
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = message.value.trim();
    if (!text || button.disabled || !ready()) return;
    sending = true;
    button.disabled = true;
    status.textContent = 'Sending to both widgets…';
    const results = await Promise.allSettled(frames.map(frame => send(frame, text)));
    sending = false;
    status.textContent = results.map((result, i) => frames[i].title + ': ' + (result.status === 'fulfilled' ? result.value : result.reason.message)).join(' · ');
    button.disabled = !ready();
  });
  setTimeout(() => { if (!ready()) status.textContent = 'Widgets have not loaded. Rebuild apps/site-chat with npm run build:local, then reload.'; }, 20000);
})();
</script></body></html>`;
}
