# tv-z2 admin catch-to-idiom swaps

Branch: `codex/tv-z2`. Base for every sheet: merge-6, `776ce6d0f0`.
All seven sheets are DONE; no sheet STOPPED. Paths below are relative to
`apps/admin/src/`; each ledger key is `(apps/admin/src/<path>, catch-reads-error)`.
Expected reductions are pending the combine gate, not measured results.

Only the named catches and one idiom import per source file changed. Existing
why-comments remain beside the idioms. No public API, caller imports, dependencies,
manifests, lockfiles, changesets, or debt ledger changed. No Jini files changed.
Source/diff review only: no tests, baseline checks, builds, installs, type checks,
linters, gate runs, browser checks, or mutations were run, per dispatch.
No commits or pushes were made; `.git` remains read-only.

## A01 — DONE

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `admin-themes/apply.ts`: `catch-reads-error` -1 (A1).
  - `components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts`: `catch-reads-error` -2 (A7).
  - `features/dashboard/hooks/use-dashboard.hooks.ts`: `catch-reads-error` -2 (A21).
- Combine witness: blocked storage preserves in-tab choices; dashboard card failure handling stays intact.
- Gate mutation owed to combine: restore each of the five replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the five required catch replacements.

## A02 — DONE (CUT-TO)

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `components/AssistantDock/hooks/byok-runtime.hooks.ts`: `catch-reads-error` -1 (A3).
  - `components/AssistantDock/hooks/agents-inventory.hooks.ts`: `catch-reads-error` -1 (A4).
  - `components/AssistantDock/hooks/chat-package-kind.ts`: `catch-reads-error` -1 (A6).
- A3 and A4 use the CULL's exact text. Discovery remains optional, with `fallback: []` and no `observe`; rescan decoding retains the selective POST catch and lazy fresh GET.
- Combine witness: absent discovery starts no callback; rejected rescan decoding reaches the fresh GET; unreadable ZIP remains an attachment.
- Gate mutation owed to combine: restore each of the three replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the three required catch replacements.

## A03 — DONE

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `features/fs-files/hooks/use-folder-drop.hooks.ts`: `catch-reads-error` -1 (A35).
  - `lib/browser-working-directory-access.ts`: `catch-reads-error` -2 (A92).
- Combine witness: failed previous-root reads do not block the write; failed directory history leaves the picker usable. Drop notice and picker abort handling remain unchanged.
- Gate mutation owed to combine: restore each of the three replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the three required catch replacements.

## A04 — DONE

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `features/webmcp/browser-agent-settings.hooks.ts`: `catch-reads-error` -2 (A83).
  - `lib/escape-owned-by-inner-layer.ts`: `catch-reads-error` -1 (A93).
- Combine witness: failed preference storage retains the session choice and notifies listeners once; only modern selector failure reaches the lazy legacy selector. The write and session-override reset remain inside the same work callback.
- Gate mutation owed to combine: restore each of the three replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the three required catch replacements.

## A05 — DONE (CUT-TO)

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `lib/browser-stream.ts`: `catch-reads-error` -1 (A90).
  - `lib/server-reconnect.ts`: `catch-reads-error` -1 (A97).
- A90 uses the CULL's exact two lines, retaining the existing capability guard and lock recovery; no destructuring or non-null assertion.
- Combine witness: channel failure returns before listener registration and leaves the visibility-managed stream in charge; failed readiness probes return false. Reconnect status and shared poll promise ownership are unchanged.
- Gate mutation owed to combine: restore each of the two replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the two required catch replacements, including the replaced channel declaration.

## A06 — DONE

- Base: merge-6, `776ce6d0f0`.
- Files / ledger keys / expected finding reduction:
  - `lib/execution-settings.ts`: `catch-reads-error` -2 (A94).
  - `site-section-availability.hooks.ts`: `catch-reads-error` -2 (A101).
- Over-500-line file: `lib/execution-settings.ts` was 550 lines and is now 548; recorded and continued as instructed.
- Combine witness: malformed/inaccessible legacy credentials remain absent; failed clearing stays best effort. Sites storage failures preserve the existing server-owned availability behavior. `defaultSitesRowStorage` is unchanged.
- Gate mutation owed to combine: restore each of the four replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the four required catch replacements.

## A07 — DONE

- Base: merge-6, `776ce6d0f0`.
- File / ledger key / expected finding reduction:
  - `lib/settings-tabs.ts`: `catch-reads-error` -2 (A99).
- Combine witness: marker storage failures do not block live withdrawal. Both consent events remain in their original order around the durable metrics write and remaining writes.
- Gate mutation owed to combine: restore each of the two replaced catches and confirm the corresponding finding returns.
- Tests added/changed: none; no bug sheet or red reason.
- Diff re-read deletions: none beyond the two required catch replacements.

Expected total reduction: 22 findings across 15 source ledger keys. Retain all
residual findings. Combine owns gate verification and mutations; `--update` is
owed only after zero New/Worse lines and confirmation that every stored count
decreased. No local gate run or ledger update was performed.

Handoff re-read deletion: removed seven unnecessary browser-look status fields;
the CULL deletes that obligation. No unrelated source edits needed deletion.
