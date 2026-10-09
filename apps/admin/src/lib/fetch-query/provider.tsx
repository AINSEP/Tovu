import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { FetchQueryProvider as TanStackFetchQueryProvider } from "@jini-ai/ui/fetch-query/tanstack";

// Keep the dynamic import itself inside Vite's compile-time development branch so
// production emits neither a devtools chunk nor a reference that could download one.
// Off by default even in development (owner 2026-10-08: the floating devtools button was unwanted);
// opt in with VITE_TANSTACK_DEVTOOLS=1. Planned home: a tab on the Observability page.
const QueryDevtools = import.meta.env.DEV && import.meta.env.VITE_TANSTACK_DEVTOOLS === "1"
  ? lazy(() => import("@tanstack/react-query-devtools").then(module => ({ default: module.ReactQueryDevtools })))
  : null;

/** Admin composition only: Jini owns the adapter and every section keeps its existing hooks.
 * The optional devtools component is a DI seam for host-owned tooling and wiring tests;
 * omission selects the development-only lazy import, and null disables the panel.
 * @example <FetchQueryProvider><App /></FetchQueryProvider> */
export function FetchQueryProvider({ children, devtools: Devtools = QueryDevtools }: { children: ReactNode; devtools?: ComponentType<{ initialIsOpen: boolean }> | null }) {
  return <TanStackFetchQueryProvider>
    {children}
    {Devtools && <Suspense fallback={null}><Devtools initialIsOpen={false} /></Suspense>}
  </TanStackFetchQueryProvider>;
}
