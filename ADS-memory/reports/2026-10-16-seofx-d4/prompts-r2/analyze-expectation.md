# Update one exact-meta expectation for the new openGraph.imageSource field

Persona: Programmer (test-only). Repo: Jini (/Users/la/Programming/Jini, writable).
RULES: do NOT run tests, typecheck or builds. Do NOT commit or touch git state. Edit ONLY
`/Users/la/Programming/Jini/packages/cms/src/seo/__tests__/seo.analyze.test.ts`. Report
`CHANGED FILES:` + `NOT DONE:`. Smallest change; keep comments.

`getEntryMeta` now also returns `openGraph.imageSource` ('override' | 'content' | 'default', omitted
when there is no image; see `buildOpenGraph` in `packages/cms/src/seo/seo.ts`). The sibling
`seo.test.ts` exact expectation was already updated the same way. This one still fails:

```
FAIL  src/seo/__tests__/seo.analyze.test.ts > analyzeEntry: carries the fully-resolved SeoMeta in `resolved`
AssertionError: Expected values to be strictly deep-equal:
    "openGraph": Object {
      "description": "Social description",
      "image": "https://cdn.test/social.png",
      "imageOverridden": true,
+     "imageSource": "override",
      "siteName": undefined,
```

Add `imageSource: "override"` to that test's expected `openGraph` object (next to
`imageOverridden: true`). Check the rest of the file for any other exact `openGraph` expectation
with an image and add the matching value only if one exists.
