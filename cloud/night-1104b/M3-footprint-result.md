Programmer(Direct): macOS footprint sampling now defaults **ON**. `ps` still supplies ownership/CPU/RSS; one batched `top` call supplies footprint. Failures retain RSS with M2’s “approx.” label.

Root cause: [desktop-resources.ts:168](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop/src/desktop-resources.ts:168) previously required explicit sampler injection, which production omitted.

Changed only three M2 files:

- [desktop-resources.ts](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop/src/desktop-resources.ts): default wiring and executor injection.
- [desktop-resources.test.ts](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop/src/desktop-resources.test.ts): six tests added before production edits, covering batching/cadence, failures/recovery, partial fallback, overrides, platforms and ownership.
- [ResourcesPanel.render.test.ts](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop/src/renderer/ResourcesPanel.render.test.ts): fake executor for the existing RSS fixture.

Scoped lint passes with both complexity ceilings set to **9**; whitespace checks pass. Architecture review found no new boundary changes or generic logic. Cost: **one added probe per sample × 1 MiB `maxBuffer`**, at the existing cadence.

Open: **tests remain unrun**, as instructed; GREEN and coverage are unverified. No commits.

Exact commands from `apps/desktop`:

```bash
node --import ./scripts/resolve-ts-ext.ts --test --test-timeout=60000 --test-concurrency=2 src/desktop-resources.test.ts src/desktop-reported-regressions.test.ts
node --import tsx --test --test-timeout=60000 --test-concurrency=2 src/renderer/ResourcesPanel.render.test.ts
```