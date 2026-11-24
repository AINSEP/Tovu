# features/forms

## Wiring
- `submission-ip-expiry-sweep.ts` is the host binding of `@jini-ai/cms/forms/site/submission-ip-expiry-sweep`: it binds the kernel-backed retention repo, the labelled console warning and the published-package fallback (`Reflect.get` on `@jini-ai/cms/forms`); started from `server/runtime/composition/site-deps/open-store.ts`.
