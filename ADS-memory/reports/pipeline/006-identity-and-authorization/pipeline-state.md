# Pipeline State: FEAT-006-identity-and-authorization

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| spec_provider | speckit |
| provider_output_root | ADS-memory/specs/006-identity-and-authorization/ |
| spec_version | 0.7.0 |
| spec_hash | sha256:5544fb325854e9bea531ee01b57ca8dc63d7bcae2f8f1be4c2b00183cbc96a7c |
| spec_hash_history | sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc (v0.6.0-DRAFT, admin CRUD completion amendment) · sha256:5544fb325854e9bea531ee01b57ca8dc63d7bcae2f8f1be4c2b00183cbc96a7c (v0.7.0-DRAFT, current — `CREATE_PRINCIPAL` HTTP-surface amendment, resolves ADR-PIPE-006 Decision 3 `[NEEDS CLARIFICATION]`) |

**Bookkeeping note (Coordinator, 2026-07-28):** This file did not exist despite `adr.md`/`implementation-outline.md`/`critical-internal-constraints.md` already being present — a gap from an earlier dispatch. Reconstructed retroactively from those artifacts plus `feature.spec.md`'s own revision history; dates for the 0.5.x stages are read from that history, not independently re-verified against session transcripts.

## Stage Ledger

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| Spec (0.5.6) | APPROVED | 2026-07-09 | Human checkpoint cleared by owner Leon Aburime; security core (authorize matcher / INV-07 clamp / composite FKs / hash-only secrets) closed after 5 audit rounds (F-052..F-054). |
| Spec Amendment (0.6.0 — admin CRUD completion) | COMPLETE, status reverted to DRAFT | 2026-07-21 | Adds `ENABLE_PRINCIPAL`/`UPDATE_USER`/`RESET_USER_PASSWORD`/`UPDATE_ROLE`/`UPDATE_POLICY`/`DELETE_ROLE`/`DELETE_POLICY` + documents 8 pre-existing undocumented endpoints. Per this project's amendment convention, status reverts to DRAFT pending a fresh Red-Team pass + owner checkpoint over the new material only. **Not yet done.** |
| Software Architect (API-key issuance plumbing) | PROPOSED | 2026-07-28 | `adr.md` (ADR-PIPE-006 / mirrored at `reports/architecture/ADR-048`) — designs `api_keys` schema/repo port, SHA-256-over-random-secret key hashing (not a port, by analogy to existing session-token hashing), and `APIKEY_ISSUE`/`APIKEY_REVOKE` plumbing. Explicitly declined to decide `CREATE_PRINCIPAL`'s HTTP-surface shape unilaterally (Decision 3 / Article VII exception) and routed it to Spec Agent instead. `critical-internal-constraints.md` + `implementation-outline.md` also produced this pass. **Awaiting human architecture sign-off** — not yet given. |
| Spec Amendment (0.7.0 — `CREATE_PRINCIPAL` HTTP surface) | **COMPLETE** | 2026-07-28 | Spec Agent (persona `agents/spec/skills.md` loaded) resolved ADR-PIPE-006 Decision 3: new dedicated endpoint `APIKEY_PRINCIPAL_CREATE` (`POST /api/admin/v1/api-keys/principals`, gated `apikey.manage`) rather than folding an implicit mint into `ISSUE_API_KEY`'s body — rejected the fold-in because AC-23/AC-25a are phrased in terms of a caller-supplied bound `principalId` and would become inexpressible without it. New AC-33. Also repaired a disclosed, unrelated pre-existing drift: api.spec §1's documented `/admin/api/...` path prefix matched no real route (`src/server/` routes are actually `/api/admin/v1/...`) — corrected in the same pass. Security core (authorize matcher / INV-07 / composite FKs / hash-only secrets), `APIKEY_ISSUE`/`APIKEY_REVOKE` contracts, and state.spec §3's `CREATE_PRINCIPAL` row are all byte-unchanged. Validator (`validate_spec_package.py --phase spec --print-hash`) re-run by Coordinator: computed hash matches `feature.spec.md`'s recorded `content_hash` exactly. Remaining VIOLATIONs are exactly the expected, by-design DRAFT-status ones (B-03/B-32/overall) — not defects. |

## Next Step

Both open amendments (0.6.0 admin-CRUD-completion, 0.7.0 `CREATE_PRINCIPAL` surface) need **one combined Red-Team pass over the new material only**, then an **owner DRAFT→APPROVED checkpoint**, before TDD can certify against ADR-PIPE-006 and Programmer can build the API-key issuance plumbing. Separately, ADR-PIPE-006 itself still needs **human architecture sign-off** (independent of the spec checkpoint above — both gates must clear).
