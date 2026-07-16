# UI Contract Spec: storage-timeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-017`
- Feature: `FEAT-017-storage-timeline`
- Version: `1.3.0`
- Content Hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`
- Last Edited: `2026-07-15T00:45:00Z`

## Purpose
Defines the Storage admin screen's UI components: the Timeline (drift banner + ledger list), the
migrate-forward wizard (this domain's plan→confirm→execute UI instantiation), the restore-points
panel, the restore-guidance deep link, and the optional Tier-3 read-only browser panel.

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `StorageTimelineScreen` | Top-level Storage admin screen wiring | Section 2.1 | Section 3.1 |
| `DriftBanner` | Surfaces `ahead`/`diverged` drift status above the ledger | Section 2.2 | Section 3.2 |
| `LedgerList` | Presents the reverse-chronological `storage_ledger` rows | Section 2.3 | Section 3.3 |
| `LedgerRowCard` | Presents a single ledger row and its restore-point link | Section 2.4 | Section 3.4 |
| `MigrateForwardWizard` | Drives `plan()`→`confirm()`→`execute()` for migrate-forward | Section 2.5 | Section 3.5 |
| `RestorePointsPanel` | Lists restore points; offers `backup_create_restore_point` | Section 2.6 | Section 3.6 |
| `PendingMigrationBanner` | Renders when `site.servingStatus === 'PENDING_MIGRATION'` | Section 2.7 | n/a |
| `Tier3BrowserPanel` | Optional read-only table browser, redacted | Section 2.8 | Section 3.8 |
| `ErrorBanner` | Renders recoverable errors from any Storage action | Section 2.9 | Section 3.9 |

## 2) Input Contracts (Props/Inputs)

### 2.1 StorageTimelineScreen
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `siteId` | yes | `string` | none | passed to orchestrator |
| `tier3Enabled` | no | `boolean` | `false` | gates rendering of `Tier3BrowserPanel` (REQ-25) |
| `incomingEnvelope` | no | `StorageContextEnvelope\|null` | `null` | deep-link context from Site-Health (REQ-24) — display continuity only, re-verified server-side |

### 2.2 DriftBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `driftStatus` | yes | `enum[in-sync, ahead, diverged, behind]` | Accepts the full shared `DriftStatus` enum (`state.spec.md` §2) for type consistency across the domain, but this component itself renders only for `ahead`/`diverged` (REQ-02). `in-sync` and `behind` both render nothing from this component — `behind` is never `DriftBanner`'s responsibility: a `behind`-and-`'cheap'` site auto-migrates silently at boot with no banner at all, and a `behind`-and-non-`'cheap'` site is surfaced exclusively by `PendingMigrationBanner` (§2.7), which gates the whole site, not just an inline banner. |
| `onOpenMigrateWizard` | no | `callback()` | only rendered when `driftStatus` is `ahead` or `diverged` |

### 2.3 LedgerList
| Input | Required | Type | Notes |
|---|---|---|---|
| `items` | yes | `array<LedgerRow>` | empty list allowed |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `hasMoreItems` | yes | `boolean` | controls load-more visibility |
| `kindFilter` | no | `LedgerKind\|null` | client-side filter mirrors REQ-04's server filter |
| `isLoadingMore` | no | `boolean` | load-more spinner |

### 2.4 LedgerRowCard
| Input | Required | Type | Notes |
|---|---|---|---|
| `row` | yes | `LedgerRow` | |
| `restorePointLabel` | yes | `string` | shows the linked restore point's timestamp, or the literal "no restore point — index operation" for `index.provision`/`index.drop` (REQ-01) |
| `onOpenRestoreGuidance` | no | `callback(row)` | only rendered for rows whose `outcome === 'failed'` or `kind === 'migration.interrupted'` |

### 2.5 MigrateForwardWizard
| Input | Required | Type | Notes |
|---|---|---|---|
| `plan` | no | `MigratePlan\|null` | populated after step 1 |
| `costAckRequired` | yes | `boolean` | `true` when `plan.costClass === 'expensive'` — the confirm control is disabled until acknowledged (REQ-06) |
| `confirmationToken` | no | `string\|null` | populated after step 2 |
| `currentStep` | yes | `enum[plan, confirm, execute, result]` | drives which step's controls are enabled |
| `isExecuting` | yes | `boolean` | disables all controls while `execute()` is in flight |

### 2.6 RestorePointsPanel
| Input | Required | Type | Notes |
|---|---|---|---|
| `restorePoints` | yes | `array<RestorePointSummary>` | |
| `costClass` | yes | `enum[cheap, expensive, unavailable]` | when `'expensive'`, the create-restore-point control requires an explicit cost acknowledgment checkbox before it is enabled (REQ-22); when `'unavailable'`, the control is disabled entirely with an explanatory tooltip (EC-04) |

### 2.7 PendingMigrationBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `reason` | yes | `enum[expensive, unavailable]` | drives the copy shown |
| `onOpenMigrateWizard` | yes | `callback()` | the only affordance this banner offers — no "dismiss" control, since public serving stays refused regardless (REQ-30) |

### 2.8 Tier3BrowserPanel
| Input | Required | Type | Notes |
|---|---|---|---|
| `tables` | yes | `array<TableDescriptor>` | never includes a `sensitive: true` column (REQ-25) |
| `selectedTable` | no | `string\|null` | |
| `rows` | no | `array<object>\|null` | rows already redacted server-side before this component ever receives them |
| `whereBuilder` | yes | `BoundedPredicate[]` | UI only offers the ADR-022 bounded expression language's operators — never a free-text SQL input (REQ-26) |

### 2.9 ErrorBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `error` | yes | `GatewayError\|StorageError\|null` | shared shape with SPEC-016's error envelope |
| `onRetry` | no | `callback()` | shown only for retryable codes (per `errors.spec.md` §2's Retryable column) |

## 3) Event Contracts (Outputs)

### 3.1 StorageTimelineScreen
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onMigrateCompleted` | `MigrateExecuteResult` | wizard reaches `DONE` | Timeline refetches and shows the new `core.migration` row |
| `onNavigateToRecovery` | `StorageContextEnvelope` | any restore-guidance link activation | Navigates to the Recovery surface, carrying display-continuity context only (REQ-24) |

### 3.2 DriftBanner
| Event | Payload | Trigger |
|---|---|---|
| `onOpenMigrateWizard` | none | banner CTA activation |

### 3.3 LedgerList
| Event | Payload | Trigger |
|---|---|---|
| `onRowSelect` | `rowId` | row click / Enter key |
| `onKindFilterChange` | `LedgerKind\|null` | filter control change |
| `onLoadMore` | none | load-more control activation |

### 3.4 LedgerRowCard
| Event | Payload | Trigger |
|---|---|---|
| `onOpenRestoreGuidance` | `row` | "resolve" / "roll back" affordance activation, only present on failed/interrupted rows |

### 3.5 MigrateForwardWizard
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onPlanRequested` | none | wizard opened / "check for updates" activation | calls `storage_plan_migrate_forward` |
| `onConfirmRequested` | `{planId, planHash}` | "Confirm" control activation (disabled until `costAckRequired` is satisfied) | calls `storage_execute_migrate_forward`'s sibling `confirm()` step |
| `onExecuteRequested` | `{confirmationToken}` | "Run migration" control activation | calls `storage_execute_migrate_forward` |
| `onWizardClosed` | none | dismiss / result acknowledged | no residual in-flight state remains once closed after a terminal result |

### 3.6 RestorePointsPanel
| Event | Payload | Trigger |
|---|---|---|
| `onCreateRestorePoint` | `{costAck?: boolean}` | "Create restore point" control activation |

### 3.8 Tier3BrowserPanel
| Event | Payload | Trigger |
|---|---|---|
| `onTableSelect` | `tableName` | table list selection |
| `onQueryRows` | `{where, orderBy, cursor, limit}` | query control activation — `where` is always built from `whereBuilder`'s bounded operators, never free text |

### 3.9 ErrorBanner
| Event | Payload | Trigger |
|---|---|---|
| `onRetry` | none | retry control activation, shown only for retryable errors |

## 4) Rendering and Interaction Rules
- [x] `DriftBanner` renders only when `driftStatus` is `ahead` or `diverged` (REQ-02); it never
      renders for `behind` — a `behind`-and-non-`'cheap'` site is instead surfaced exclusively by
      `PendingMigrationBanner` (§2.7, REQ-29), and a `behind`-and-`'cheap'` site auto-migrates
      silently at boot (REQ-28) with no banner from either component.
- [x] `MigrateForwardWizard`'s confirm control is disabled until `costAckRequired` is satisfied
      when `plan.costClass === 'expensive'` (REQ-06).
- [x] `MigrateForwardWizard`'s execute control is disabled whenever `isExecuting === true`, to
      make a double-submit structurally impossible from this surface (defense-in-depth alongside
      the server's own single-use token enforcement, SPEC-016 INV-03).
- [x] `LedgerRowCard`'s restore-guidance affordance renders only for rows with `outcome === 'failed'`
      or `kind === 'migration.interrupted'` — never for a successful row.
- [x] `RestorePointsPanel`'s create control is disabled entirely when `costClass === 'unavailable'`
      (EC-04) — no attestation/override affordance is ever rendered (REQ-08).
- [x] `PendingMigrationBanner` renders in place of normal site content whenever
      `site.servingStatus === 'PENDING_MIGRATION'`, and offers no dismiss control (REQ-30).
- [x] `Tier3BrowserPanel` is rendered only when `tier3Enabled === true`, and its `whereBuilder`
      never exposes a free-text query input (REQ-26).
- [x] Error banner displays the latest recoverable error and a retry affordance only for
      retryable codes.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | `DriftBanner`/`PendingMigrationBanner` use `role="alert"`; `MigrateForwardWizard` steps use `role="dialog"` with a labelled heading per step. |
| Labels | All controls (including the cost-acknowledgment checkbox and every `whereBuilder` operator control) have accessible names. |
| Keyboard | Full keyboard operation through all three wizard steps, with visible focus states. |
| Status updates | State transitions in `MigrateForwardWizard` (e.g. entering `QUIESCING`/`APPLYING`/`VERIFYING`) are announced via an ARIA live region so a screen-reader user is not left on a silent, indefinitely-spinning step. |
| Error clarity | Every error code in `errors.spec.md` §2 has a distinct, associated on-screen message — no generic "something went wrong" fallback for a named code. |

## 6) Composition Rules
- `StorageTimelineScreen` is the only public entry component.
- `LedgerRowCard` is rendered only within `LedgerList`.
- `MigrateForwardWizard` is rendered only when explicitly opened from `DriftBanner` or an
  operator-initiated "check for updates" action — never auto-opened.
- `Tier3BrowserPanel` is rendered only when `tier3Enabled` is `true` for the site; it is never
  reachable from an agent-tool call (REQ-25).
- `PendingMigrationBanner` replaces normal admin content (not just an inline banner) while the
  site is in `PENDING_MIGRATION`, but the Storage screen itself, including
  `MigrateForwardWizard`, remains reachable — only public serving is refused (REQ-29).

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `orchestrator.spec.md` and `state.spec.md`.
