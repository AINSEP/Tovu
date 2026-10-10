import { type ReactNode } from "react";
import { FetchQueryProvider as BuiltinFetchQueryProvider, type FetchQueryEnvironmentPort } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider as TanStackFetchQueryProvider } from "@jini-ai/ui/fetch-query/tanstack";
import { AdminFetchQueryAdapterContext } from "./adapter-context";

// Owner 2026-10-09: tooling belongs only in Observability's selected Queries tab.
// This root selects the cache adapter and never loads or renders floating tools.

// Tovu's admin ports request the same origin (including desktop loopback). navigator.onLine
// describes internet connectivity, not whether that server is reachable; let the request decide.
// This thin browser binding retains focus notifications while bypassing the internet gate.
const adminEnvironment: FetchQueryEnvironmentPort = {
  isOnline: () => true,
  subscribeOnline: () => () => {},
  subscribeFocus: ({ listener }) => {
    const visible = () => { if (document.visibilityState === "visible") listener(); };
    window.addEventListener("focus", listener);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", listener);
      document.removeEventListener("visibilitychange", visible);
    };
  },
};

/** Admin composition only: Jini owns the adapter and every section keeps its existing hooks.
 * The capability marker follows the selected provider, including the built-in alternative.
 * @example <FetchQueryProvider><App /></FetchQueryProvider> */
export function FetchQueryProvider({ children, adapter = "tanstack" }: { children: ReactNode; adapter?: "tanstack" | "builtin" }) {
  return <AdminFetchQueryAdapterContext.Provider value={adapter}>
    {adapter === "tanstack"
      ? <TanStackFetchQueryProvider environment={adminEnvironment}>{children}</TanStackFetchQueryProvider>
      : <BuiltinFetchQueryProvider environment={adminEnvironment}>{children}</BuiltinFetchQueryProvider>}
  </AdminFetchQueryAdapterContext.Provider>;
}
