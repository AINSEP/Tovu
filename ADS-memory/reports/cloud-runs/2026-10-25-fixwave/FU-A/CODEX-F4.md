Code Inspection(Review): Personas: Code Inspection + Security, for test validity and signature verification.

Reviewed `3e2fbae8…6b665ec7` and the F4 report. Four test-quality findings:

- **Medium — `packages/capability-providers/src/adapters/jwt-auth/__tests__/index.test.ts:176`** — AP8/F4.4: the “correct-length” cases decode to **31 and 33 bytes**, so both reject through the length guard. They remain green if the equal-length signature comparison is bypassed. **Smallest fix:** flip one byte of a real decoded signature, re-encode it, confirm 32 bytes, and assert rejection.

- **Medium — `packages/capability-providers/src/adapters/jwt-auth/__tests__/index.test.ts:219`** — AP7/F4.4: resolving `undefined` does not prove malformed-token `signOut` is harmless. Removing the `sub` validator still yields `null` through failed user lookup, while `signOut` accepts and revokes its `jti`. **Smallest fix:** give the malformed token a genuine session’s `jti`, call `signOut`, and assert that genuine session remains valid.

- **Medium — `packages/capability-providers/src/adapters/ws/__tests__/edges.test.ts:56`** — AP3/F4.3: malformed-channel cases always publish to `'c'`. Removing channel-type validation creates subscriptions under `5` or `undefined`, yet these assertions still pass. **Smallest fix:** also probe publication under each attempted malformed channel, using a test-only cast, and assert no delivery.

- **Low — `packages/capability-providers/src/adapters/jwt-auth/__tests__/index.test.ts:187`** — AP4/F6.1: twelve sequential users produce only two payload lengths; `seenResidues.size > 1` does not verify all three claimed padding cases. **Smallest fix:** use deterministic signed fixtures covering residues `{0,2,3}` and assert that exact set.

**Source fix: clean.** `packages/integrations/src/webhooks/signing.ts:54` rejects the trailing nibble before decoding. Uppercase hex and surrounding whitespace remain accepted; embedded junk remains rejected; the byte-length guard and `timingSafeEqual` remain intact. Regression-test commit `f5565f8c` precedes fix `55b2630c`.

Owner-approved source pins are untouched. No new process, temporary-file, or network leak identified. Static review only; no edits, tests, or servers.
