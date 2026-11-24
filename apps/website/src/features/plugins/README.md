# plugins

## Wiring

- The lipay and store data-module declarations now live in `@jini-ai/plugins/site/{lipay,store}/manifest`
  (publisher `"jini-core"`). `server/runtime/composition/data-modules.ts` lists them in
  `FIRST_PARTY_DATA_MODULES`; nothing is injected.
