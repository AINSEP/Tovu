### tovu:apps/admin/src/lib/browser-stream.ts
- **Over:** `startBrowserStream` 104 (file 150)
- **Phase:** after-move (MOVE-AFTER stream-activity, vi…) · **Batch:** size-49
- **Tests:** `apps/admin/src/lib/__tests__/browser-stream.unit.test.ts`
- **Responsibility map:** `startBrowserStream` is one closure state machine (`disposed`, `away`, `hiddenSince`, `stopConnection`, `stopTimer`, `lock`, `releaseLock`, `channel` are `let`s mutated by `halt`/`open`/`acquire`/`reconcile`/`reconcileTab`/listeners/`stop`). Its inline parameter types take ~8 counted lines.
- **Splits:**
  1. TYPES (same file, above the function): `interface StartBrowserStreamInput<Frame> { key: string; connect: …; receive?: … }` and `interface StartBrowserStreamOptions { ports?: BrowserStreamPorts; scope?: "origin" | "tab"; activity?: StreamActivity }`, copied exactly from the inline annotations. The signature becomes `startBrowserStream<Frame>({ key, connect, receive = () => {} }: StartBrowserStreamInput<Frame>, { ports = browserStreamPorts(), scope = "origin", activity }: StartBrowserStreamOptions = {}): () => void`. Body untouched.
- **Importers to update:** none (export the two interfaces only if eslint/tsc asks; nothing imports them).
- **After:** `startBrowserStream` ~96; file ~158.
- **Risks / notes:** no behaviour change. If the outline still counts > 100, stop: the body cannot be split without turning shared `let`s into an object (behaviour risk).
- **Owner exception candidate:** fallback only — the body is a single closure state machine whose steps all mutate shared locals; no helper can leave without carrying that state.
