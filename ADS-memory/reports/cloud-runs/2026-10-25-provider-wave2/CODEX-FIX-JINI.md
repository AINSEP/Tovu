Code Inspection(Review): **Code Inspection + Security** personas selected for lifecycle correctness, attribution, and secret handling.

PART JINI reviewed: `800d9caf...03cc91e03` (`gh/cloud/prov-wave2-jini`). **Changes required.**

- **High — Fan-out containment does not guarantee exactly-once execution or preserve application errors.** [fanout.ts:24](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/diagnostics/src/observability/fanout.ts:24): `once()` always invokes `inner()`. A tracker using `run(fn) { fn(); return fn(); }` executes application mutations twice. At line 30, a tracker that catches the callback’s error and returns normally also suppresses that error. **Smallest fix:** cache the callback’s result/error, refuse repeated execution, and return/rethrow that recorded outcome after scope execution.

- **Medium — PostHog identify events omit enforced site attribution.** [posthog.ts:58](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/provider-plugins/src/analytics-posthog/posthog.ts:58): `identify()` forwards traits alone, so emitted `$identify` events lack host `site_id` and site groups; traits can supply a conflicting `site_id`. **Smallest fix:** apply authoritative host attribution and groups to identify events too, using an event representation that places them on the emitted event.

- **Medium — Boundary scanner still skips valid literal imports.** [core-boundary.test.ts:71](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/provider-plugins/src/__tests__/core-boundary.test.ts:71): the raw-text prefilter skips a file containing only `import('lang\u0066use')`, although the parser decodes its literal to `langfuse`. **Smallest fix:** remove the prefilter and exercise escaped literals through the complete scanner.

Prior findings: OTel environment-credential fallback and borrowed Langfuse shutdown **appear closed by source inspection**. Ordinary template/comment import detection is fixed; boundary coverage, fan-out containment, and attribution remain incomplete as above. OTel resource attribution and Langfuse trace metadata/tags are present.

Consent still guards both analytics methods. No additional secret leakage identified in the inspected Jini changes. Tovu storage, key races, route permissions, and legacy-label handling are outside this **PART JINI** verdict.

No edits, tests, or servers run. CCN and coverage were not independently measured.
