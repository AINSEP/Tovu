# tv-z4 refresh notes

Base: merge-6 (`776ce6d0f0cd88072f38d352ff99bef7c342d25d`), branch `codex/tv-z4`.

- No caller or test import repoints; no incidental test importers recorded. These sheets change catches in place and preserve declarations.
- C08 stopped before editing either source file: `apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:51`, `composeIdentitySettings`, spans 73 physical lines (51–123), exceeding the specified 50-line cap. Resolving this would require authorization beyond the named catch swap. Both original `siteTitleReady` promises and detached catches remain intact.
- C01–C05 and C07 have an expected combined reduction of 18 `catch-reads-error` findings. Counts and behavior witnesses remain unexecuted locally under the machine rule; combine owns validation and restoring catches/parse validation for gate mutations.
- No tests added or changed. No Chrome/Electron look owed under the cull. No extra edits deleted during diff re-read; only the named catch/parse replacements remove source statements.
