export * from "@testing-library/react";

/** Test reads stay on the production query adapter, and screens get the production kits and chat
 * surfaces: the one provider tree lives in `render-with-jini-kits`, which mounts a fresh
 * FetchQueryProvider (cold cache) per tree and keeps it across rerenders. */
export { render, renderHook } from "./render-with-jini-kits";
