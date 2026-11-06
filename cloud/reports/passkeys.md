# passkeys — in progress

Job ML D2, COMMON + TRIM read from Jini origin/cloud-plans-1105. Loaded Software Architect, Programmer and TDD personas. Started 2026-11-06 00:02 UTC; deadline 02:02 UTC. Branch cloud/passkeys only, base origin/cloud/combine abead52498c80fd86b8f7b37a2caed31d98a7307. Paired Jini base 3a86f98ba03380651c8bf64b8fc18c4f90a122fd.

SimpleWebAuthn measured before adoption in Jini: server 14.0.3 tarball 121,672 bytes, browser 14.0.0 tarball 42,879 bytes; combined transitive download 589,375 bytes (26 artifacts, integrity checked). Published browser UMD 13,473 bytes / 3,806 bytes gzip. Browser library lazy-loaded on explicit action.

Prerequisite BUG: combine contained TOTP storage but did not wire it to password/launcher sessions or owner management. Fixed the missing host wiring using existing Jini service; no normal enrolled-owner session before a factor. Launcher pending proof currently falls back to Login/password re-entry.

Passkeys are an owner-only alternative second factor after password proof. Adding/removing passkeys requires current password and TOTP. TOTP stays enrolled as fallback. Jini owns ceremony rules and WebAuthn library adapter; Tovu supplies SQL, trusted configured/listener origin, HTTP and component mounting. One additive ADR-066 credential migration; existing bounded pending table holds sealed purpose-bound challenges. Recovery/TOTP removal clears passkeys with factors and proofs. No timers/polls.

Focused tests and verification in progress; exact commands and pushed SHA inventory will follow.
