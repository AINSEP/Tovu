# REFRESH

Base: `integ/merge-8` `8d613439cc36f9093e7487f3ed9e698adc77acd6`; branch `codex/tv-w1`.

- TV-ES1: `auth-i18n.ts` contains 21 non-English `DETAILS_COPY` locale arrays, although the sheet says 20. Appended the new report-ID translation to every existing array; no locale removed.
- E-O-T: named selector grep also reaches a documentation mention in `development/open-bugs.md`; no additional production caller. Documentation left untouched.
- K-04b-T and T1: the named importer greps reveal no extra test importers requiring repoints and no unlisted production importers.
- Debt refresh: exact-path read of `development/scripts/error-gate-debt.json` finds no row for either `apps/website/src/features/seo/cover-image.ts` or `apps/website/src/features/theme/validation/manifest-v2.ts` on this base. The sheet's SEO row anchor 1273 currently names another file. Debt JSON untouched; combine owns the merged-baseline shrink/verification.
- No sheet STOPPED. No tests, builds, installs, type checks, linters, mutations, Chrome looks, or gates run, per machine rule. Required combine work is listed per sheet in COMMIT-PLAN.md, including worker graph/budget deletion STOPs.
