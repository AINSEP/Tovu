import { createContext } from "react";

/** Tovu's composition choice; Observability must not import a vendor to detect it.
 * Null means the host has not supplied this adapter capability. */
export const AdminFetchQueryAdapterContext = createContext<"tanstack" | "builtin" | null>(null);
