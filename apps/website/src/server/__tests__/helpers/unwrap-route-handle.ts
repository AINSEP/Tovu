/**
 * A route layer's registered function, or, when the route was registered through `asyncRoute(...)`,
 * the async handler inside it. Direct-call tests await what this returns; the `asyncRoute` wrapper
 * itself returns before the handler finishes, so awaiting the wrapper would assert too early.
 * Any other function passes through unchanged.
 */
export function unwrapRouteHandle<Handle extends (...args: never[]) => unknown>(handle: Handle): Handle {
  const inner: unknown = Reflect.get(handle, "handler");
  return typeof inner === "function" ? (inner as Handle) : handle;
}
