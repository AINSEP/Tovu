import type { ReactNode } from "react";

import { FetchQueryProvider as AdminFetchQueryProvider } from "@/lib/fetch-query/provider";

/**
 * The provider every admin test mounts: the same composition `main.tsx` renders (Jini's TanStack
 * adapter), so suites exercise the cache production runs rather than the default entry's built-in
 * one. Adapter contract tests can explicitly select the built-in alternative. Tooling loads only
 * inside Observability's selected tab. Each mount owns a fresh client, so each `render` still
 * starts from a cold cache.
 * @example render(<FetchQueryProvider><Screen /></FetchQueryProvider>)
 */
export function FetchQueryProvider({ children, adapter }: { children?: ReactNode; adapter?: "tanstack" | "builtin" }) {
  return <AdminFetchQueryProvider adapter={adapter}>{children}</AdminFetchQueryProvider>;
}
