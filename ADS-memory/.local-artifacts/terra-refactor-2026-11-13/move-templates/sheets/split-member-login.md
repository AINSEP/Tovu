# website/features/member-login (W1 #28) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: yes: C3.repoint.tsv:387 (`link-service.ts`), C4.repoint.tsv:194 (`oidc-login.ts`) -> those slices **execute after wave B merge**

## Files and labels
link-policy.ts (MOVE 39) -> `@jini-ai/user-management` server/; link-service.ts (MIXED 172); oidc-login.ts (MIXED 247: `stateCodec` lines 81-99 is DEDUPE-AFTER-HARDENING vs `@jini-ai/oauth` sealed-state.ts, i.e. a HARDEN slice, security-sensitive); providers.ts (MIXED 65).

## Judgment notes for the sheet author
oidc-login state codec = security parity (HARDEN, Opus; owner 11-10 rule on security retire applies by analogy). link-policy.ts (39, no overlap) is the smallest safe first slice: host supplies the MemberRecord status shape. Tier: Opus for oidc/link-service, Sonnet for link-policy.

## Owner question
-
