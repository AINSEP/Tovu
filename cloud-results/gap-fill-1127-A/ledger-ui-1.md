# ledger ui-1 (w62-cov-ui-1) — final
Commits: 2918726f, b5c5db68, 28620ed3, + final (see git log)
## Done (scoped cov after, lines/br/fn)
- find hooks x4 + find-focus-clock + find/index: 100/100/100 (find-hooks.test.tsx 16 tests). find-bar-state 100/100/100 (+1 find-rules test)
  Mutations verified live: drop `if (restoringFocus.current) return` -> 1 red; drop `if (!keepGoing) return` -> 2 red.
- live-views use-live-views/live-views/index: 100/100/100 (use-live-views.test.tsx 6, live-views.test.ts +1)
- tool-approval 100/100/100 (+3); CodeWrapToggle/useCodeWrap 100 (+4 new file); AgentDiagnosticRow 100 (+6 new file, BUG fixed)
- media-providers/dependencies 100/100/100 (+4); react/testing.tsx 100 (+2 in kit.unit.test.tsx); unhandled-case 100 (+1 new file)
- credential-card 100/96.66/100 (+4; line 45 `pluginForm.details ?? []` never nullish); PopoverMenu 100/100/100 (+2)
## BUG fixed
- AgentDiagnosticRow.tsx:91 filter kept `undefined` from unhandledCase for unknown wire intent -> crash reading onClick. Filter now drops undefined.
## Skipped / left
- CustomSelectMarkup.tsx: orphan duplicate of CustomSelect.tsx 458-600, imported nowhere -> recommend delete, not test.
- Barrels app-shell/find-bar/number-stepper/resource-monitor/site-card index.ts: EXCEPTION pure re-export.
- Small branch gaps (InfoTip, charts wire, ExecutionTab.hooks, useReasoningControl, rules, find-target, editor-blocks, select.tsx, use-site-view-preference, fields.ts 82-83 + integrations/rules 211-212 (unhandledCase tails), outcome, structured-details, useMediaProvidersTab, useMentionAutocomplete, NumberStepper fn, catalog-manifests fn, panel-kit hooks, project-locations, SiteListToolbar, site-list-view, use-site-list-prefs, SketchEditor, TabStrip, scrollable, PillButton, select-popover, design-md, trim-chars): not reached within cap.
