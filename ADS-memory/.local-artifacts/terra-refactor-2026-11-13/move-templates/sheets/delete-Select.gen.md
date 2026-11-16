id: DL-Select-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: admin/components/Select
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (useSelectDropdown, focusableInDomOrder, computePosition, buildOptionId, repositionOrClose, resolveTabTarget, edgeHighlightIndex, highlightedOptionOrNull, applyHighlightKey); likely DEDUPE/reduce-to-binding or a fold with moved bodies
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (Select, resolveSelectTriggerLabel); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/admin/src/components/Select/Select.hooks.tsx | blob 74466a28fbc52cee38a5f319a87d853bef5748f2
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "Select.hooks" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/admin/src/components/Select/Select.hooks.tsx'
census_cmd: rg -n --no-heading -e '["'][^"']*Select\.hooks(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/admin/src/components/Select/Select.hooks.tsx
importers (1 prod, 2 test; resolved to this file):
  - apps/admin/src/components/Select/Select.tsx:3 | static | "./Select.hooks"
  - apps/admin/src/components/__tests__/Select.hooks.unit.test.tsx:16 | static | "../Select/Select.hooks"
  - apps/admin/src/components/__tests__/Select.unit.test.tsx:6 | static | "../Select/Select.hooks"
path_literals (rg -F "Select/Select.hooks", not already importers):
  - development/refactor-patterns/dedupe/PLAN.md:123:- **Dead code:** Tovu `apps/admin/src/components/Select/Select.hooks.tsx` helpers have no production importer (only `components/__tests__/Select.hooks.
baselines (json files naming the path): -
declarations (name | line | kind):
  - useSelectDropdown | apps/admin/src/components/Select/Select.hooks.tsx:11 | function
  - focusableInDomOrder | apps/admin/src/components/Select/Select.hooks.tsx:31 | function
  - computePosition | apps/admin/src/components/Select/Select.hooks.tsx:43 | function
  - buildOptionId | apps/admin/src/components/Select/Select.hooks.tsx:58 | function
  - repositionOrClose | apps/admin/src/components/Select/Select.hooks.tsx:75 | function
  - resolveTabTarget | apps/admin/src/components/Select/Select.hooks.tsx:97 | function
  - edgeHighlightIndex | apps/admin/src/components/Select/Select.hooks.tsx:109 | function
  - highlightedOptionOrNull | apps/admin/src/components/Select/Select.hooks.tsx:117 | function
  - applyHighlightKey | apps/admin/src/components/Select/Select.hooks.tsx:139 | function
  - usePanelPosition | apps/admin/src/components/Select/Select.hooks.tsx:4 | re-export from "@jini-ai/ui/admin-widgets"
  - PanelPosition | apps/admin/src/components/Select/Select.hooks.tsx:5 | re-export (type) from "@jini-ai/ui/admin-widgets"
  - SelectOption | apps/admin/src/components/Select/Select.hooks.tsx:5 | re-export (type) from "@jini-ai/ui/admin-widgets"
folds: TODO(judge)
tests:
  - apps/admin/src/components/__tests__/Select.hooks.unit.test.tsx | blob e3fbdb2c775d7eece5b3d598e65857dc5f175466 | TODO(judge) delete|repoint
  - apps/admin/src/components/__tests__/Select.unit.test.tsx | blob 635544c1361dc00740a84e45ec006cf74e45f049 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
tovu_file: apps/admin/src/components/Select/Select.tsx | blob c30b272cefcedd9d7d1d2be69afc557d4d5ad474
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "Select" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/admin/src/components/Select/Select.tsx'
census_cmd: rg -n --no-heading -e '["'][^"']*Select(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/admin/src/components/Select/Select.tsx
importers (1 prod, 2 test; resolved to this file):
  - apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx:9 | static | "../Select/Select"
  - apps/admin/src/components/__tests__/Select.unit.test.tsx:8 | static | "../Select/Select"
  - apps/admin/src/components/__tests__/agent-handle-batch1.unit.test.tsx:6 | static | "../Select/Select"
path_literals (rg -F "Select/Select", not already importers):
  - development/refactor-patterns/dedupe/PLAN.md:123:- **Dead code:** Tovu `apps/admin/src/components/Select/Select.hooks.tsx` helpers have no production importer (only `components/__tests__/Select.hooks.
  - development/refactor-patterns/dedupe/PLAN.md:367:| X26 | MOVE-PLAN | apps/admin/src/components/Select/Select… | - | 140 | - | @jini-ai/ui/admin-widgets (Select already mounted from Jini) | Tovu "host-
  - apps/admin/src/styles.css:2618:   Root cause, isolated by bisecting `.widget-add-control`'s two children: `components/Select/Select.tsx`'s
  - apps/admin/src/styles/select.css:2: * `components/Select/Select.tsx` — trigger + floating panel for the custom searchable dropdown
  - apps/admin/src/components/Select/Select.hooks.tsx:7:// Live state/effects and their rationale: Jini/packages/ui/src/features/admin-widgets/components/Select/Select.hooks.tsx.
  - apps/admin/src/components/__tests__/WidgetPickerDialog.unit.test.tsx:9: * emulated host), that swapping its two native `<select>`s for `components/Select/Select.tsx` didn't
  - apps/admin/src/components/__tests__/Select.unit.test.tsx:6:import { useSelectDropdown } from "../Select/Select.hooks";
  - apps/admin/src/components/__tests__/Select.hooks.unit.test.tsx:16:} from "../Select/Select.hooks";
baselines (json files naming the path): -
declarations (name | line | kind):
  - SelectProps | apps/admin/src/components/Select/Select.tsx:8 | type
  - Select | apps/admin/src/components/Select/Select.tsx:13 | function
  - resolveSelectTriggerLabel | apps/admin/src/components/Select/Select.tsx:21 | function
  - SelectOption | apps/admin/src/components/Select/Select.tsx:6 | re-export (type) from "@jini-ai/ui/admin-widgets"
folds: TODO(judge)
tests:
  - apps/admin/src/components/__tests__/Select.unit.test.tsx | blob 635544c1361dc00740a84e45ec006cf74e45f049 | TODO(judge) delete|repoint
  - apps/admin/src/components/__tests__/agent-handle-batch1.unit.test.tsx | blob 7cd6392bf5f799166dac467d3435ab3408fbb2c5 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
