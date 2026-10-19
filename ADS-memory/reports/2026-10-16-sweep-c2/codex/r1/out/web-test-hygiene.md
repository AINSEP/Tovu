Programmer(Execution): Chose Programmer for minimal test repairs and lifecycle tracing.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/integration/path-containment.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/seo/__tests__/cover-image-head.test.ts

Added isolation as the first import in both missing files; found no additional direct real-home access in the registry test.

Teardown now awaits the existing store close API in all three fixtures, stopping retention timers, draining export-app boot work, and closing owned databases. Environment restoration runs in `finally`.

DECISION: Updated and renamed the SEO test. Jini `391560e8` deliberately reuses the resolved OG image for X without a Twitter override, including external HTTPS URLs; added the commit comment and retained JSON-LD exclusion.

NOT DONE: Runtime confirmation of the teardown fix. Tests, typechecks, builds, and package scripts were not run, as instructed. No git state changes, Jini edits, or protected production-file edits.
