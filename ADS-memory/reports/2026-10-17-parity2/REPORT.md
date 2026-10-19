# parity2 (step-2 parity) — summary relayed by coordinator (agent's write was blocked)
- Parity HOLDS: no step-2 colour/shadow/border/outline/backdrop diffs. Light (DPR2) 51/64 identical first pass; dark (DPR1, window moved display) 41/64 identical after rechecks; all remaining diffs = noise (baseline caught transitions mid-start, media load state, tiptap runtime sheet, focus-visible flakes, conic angle).
- Root vars identical both schemes except --jini-(theme-)overlay-bg/-shadow (unconsumed at HEAD; new consumers resolve to old literals).
- RED 5 admin tests (pin pre-step-2 CSS): selection-ring-css.unit.test.ts x2 (settings.css:285/288 now var(--jini-control-shadow-selected/-swatch-selected)); admin-themes.unit.test.ts "scopes every classic block" rejects CLASSIC_ROOT [data-theme="light"] rule (classic/admin.css:397); "preserves all inherited root token values" x2 (bridge dropped --jini-font-body/heading/mono, --jini-radius:8px, --jini-density:1; Jini variables.css:61-65 declares same values).
- Green: admin tsc 0; Jini ui theme 18/18; check-package-layers 71/71; Jini dist fresh.
- Literals left: only 8 documented masks (styles.css:2632,4217,4474,4497).
- Commit set = 22 CSS files incl. apps/admin/src/styles.css (glob missed it) + 2 docs + Jini variables.css.
