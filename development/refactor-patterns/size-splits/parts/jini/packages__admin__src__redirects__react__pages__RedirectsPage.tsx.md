### jini:packages/admin/src/redirects/react/pages/RedirectsPage.tsx
- **Over:** `RedirectsPage` 111
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/redirects/react/__tests__/Redirects.unit.test.tsx`, `.../redirects-binding.unit.test.tsx`, `.../copy-polish.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<form className="card form-measure" onSubmit={submitCreate}>` (~62 lines) — create-redirect form; B = header, `DataTable`, `ConfirmDialog`, guards — list screen.
- **Splits:**
  1. SUB-COMPONENT `RedirectCreateForm({ submitCreate, saving, t }: RedirectCreateFormProps): JSX.Element` (same file, above) ← unit A verbatim; add any other hook names it reads (check `locale`, `error`). Types from the `useWiredRedirects` return.
- **Importers to update:** none.
- **After:** `RedirectsPage` ~52; `RedirectCreateForm` ~65.
- **Risks / notes:** form fields may be uncontrolled (FormData in `submitCreate`) — keep `name=`/`id=` attributes verbatim.
