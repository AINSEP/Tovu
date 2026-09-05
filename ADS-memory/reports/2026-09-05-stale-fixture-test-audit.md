# Stale-Fixture Test Audit — 2026-09-05

Status: IN PROGRESS (skeleton committed early per incremental-commit policy)

Scope: find tests that seed a pristine identity/DB fixture and therefore never exercise the
state that actually ships (the `sites/tovu-com/content.db` vintage), read-only audit, no fixes.

## 1. Seeding helpers and call-site counts (MEASURED via grep)

TODO — fill in.

## 2. Tests whose assertions provably diverge fresh vs. aged (the money question)

TODO — fill in.

## 3. Comments claiming to cover the shipping/deployed case

TODO — fill in.

## 4. Other early-return-once-seeded siblings

TODO — fill in.

## 5. Ranked recommendations (not implemented)

TODO — fill in.
