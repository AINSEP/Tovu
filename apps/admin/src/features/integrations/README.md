# features/integrations

Webhook subscriptions and their delivery log — the two screens behind the sidebar's
**Design & System → Integrations** entry.

| file | what it is |
|---|---|
| `Integrations.tsx` | List of webhook subscriptions, create/delete. |
| `IntegrationDeliveries.tsx` | Per-subscription delivery history (`DataTable`, timestamps). |
| `index.ts` | The only surface `panels.tsx` may import. |

## Notes for anyone editing here

`Integrations.tsx` has a unit test (`__tests__/Integrations.unit.test.tsx`).
`IntegrationDeliveries.tsx` does not — treat a change there as unverified until you have driven it
in a browser.
