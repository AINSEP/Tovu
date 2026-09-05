# Runner vs. `apps/desktop` — feature-parity matrix

Status: SKELETON — capability list only, rows being filled in this session.

Scope: code-level, read-only audit of `/Users/la/Programming/Tovu-Runner` (Electron fleet
supervisor, read-only, not launched) against `/Users/la/Programming/Tovu/apps/desktop` (thin
Electron shell, not launched). No tests run. Screenshots owned by a sibling agent
(`runner-vs-desktop-shots`).

## Parity matrix

Columns: Capability | Runner (file:line, ~lines) | apps/desktop | Gap | Needed for multi-site? | Port / Rebuild / Skip

### Project/site lifecycle (create, open, remove, list)
(rows pending)

### Window & navigation
(rows pending)

### Per-project chat
(rows pending)

### Onboarding / first-run
(rows pending)

### Process supervision (spawn, health, restart, orphan reconciliation, shutdown)
(rows pending)

### Persistence / registry
(rows pending)

### Settings / credentials
(rows pending)

### Updates / packaging
(rows pending)

## Q1. What Runner does that apps/desktop cannot do at all today
(pending)

## Q2. What apps/desktop gets for free from the Tovu server
(pending)

## Q3. Genuinely minimal path to "run several sites at once"
(pending)

## Q4. What must be ported, not rebuilt (identity-before-kill and siblings)
(pending)

## Q5. What should be deleted rather than ported
(pending)

## Prior do-not-port rulings — agree/disagree with reasoning
(pending)

## What could not be verified
(pending)
