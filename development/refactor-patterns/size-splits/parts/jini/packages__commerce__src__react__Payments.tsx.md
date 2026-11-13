### jini:packages/commerce/src/react/Payments.tsx
- **Over:** `Payments` 103
- **Phase:** now (JINI 103) · **Batch:** size-22
- **Tests:** `src/react/__tests__/Payments.unit.test.tsx`, `src/react/__tests__/Payments.locale.unit.test.tsx`, `src/react/__tests__/Payments.boundaries.unit.test.tsx` (package `@jini-ai/commerce`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const t`, page header, notice | page frame (stays) |
| B | the four `<section className="dash-panel" …>` blocks (providers, catalog/pricing, checkout/orders, revenue) | one status panel each, same shell |

- **Splits:**
  1. SUB-COMPONENT in the same file, module level, above `Payments`: `function PaymentsPanel({ headingId, title, statusLabel, description, children }: PaymentsPanelProps): ReactElement`, with `interface PaymentsPanelProps { headingId: string; title: string; statusLabel: string; description: string; children?: ReactNode }` (add `ReactNode` to the `import type` from react). It renders exactly the shared shell: `<section className="dash-panel" aria-labelledby={headingId}><div className="dash-panel-head"><h2 className="dash-panel-title" id={headingId}>{title}</h2><span className="status status-disabled">{statusLabel}</span></div><div className="dash-panel-body"><p>{description}</p>{children}</div></section>`.
  2. In `Payments`, each section becomes `<PaymentsPanel headingId="commerce-payment-providers" title={t("Payment providers")} statusLabel={t("Setup required")} description={t("Provider adapters remain …")}>…</PaymentsPanel>`, passing the existing `<div className="page-actions" …>` block unchanged as children (providers, catalog, checkout). The revenue panel gets no children. Every `t("…")` string, `href`, `agentHandle(...)` call and `aria-label` stays byte for byte, in the same order.
- **Importers to update:** none (`PaymentsPanel` is not exported).
- **After:** `Payments` ~55; `PaymentsPanel` ~15; file ~85.
- **Risks / notes:** the DOM output must stay identical (the tests query by heading id and text). React renders `children === undefined` as nothing, so the revenue panel's body is still just the `<p>`. Plain props only; `t` is called in `Payments`, never passed down.
