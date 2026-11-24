import { formatFindMatchCount } from '@jini-ai/ui/find';
import type { FindInPageResult } from '../contracts/find-in-page.js';

/** The find bar's counter copy. The bar's state machine lives in `@jini-ai/ui/find`; only the
 *  product's English wording stays here. */
const MATCH_COUNT_LABELS = {
  noResults: 'No results',
  matchOf: ({ ordinal, total }: { ordinal: number; total: number }) => `${ordinal} of ${total}`,
};

/** The bar's own counter text: `"<ordinal> of <total>"`, or `"No results"` once a query has
 *  actually returned zero matches — never shown for an empty query, which has no `result` yet. */
export function formatMatchCount({ result }: { result: FindInPageResult | null }, _options: Record<string, never> = {}): string {
  return formatFindMatchCount({ result, labels: MATCH_COUNT_LABELS });
}
