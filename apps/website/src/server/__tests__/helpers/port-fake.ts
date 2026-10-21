/**
 * Typed route-deps fakes for direct-invoke route tests, in place of `as any`.
 *
 * A route registrar takes its whole deps bag (`TaxonomyRouteDeps`, `UsersRouteDeps`, ...), but one
 * test only exercises a few members. `portFake<T>` accepts just those members: each top-level key
 * must be a real key of `T`, a top-level function (`authorize`, a loader) keeps its exact
 * signature, and a port object (`termRepo`, `trash`, ...) may supply any subset of its own methods.
 * Members the test omits are `undefined` at runtime — exactly what an unwired optional port is — so
 * a route that touches one it should not fails loudly in the test.
 */
type PortMethods<P> = {
  [M in keyof P]?: P[M] extends (...args: never[]) => unknown ? (...args: never[]) => unknown : P[M];
};

export type PortFake<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends (...args: never[]) => unknown
    ? T[K]
    : NonNullable<T[K]> extends object ? PortMethods<NonNullable<T[K]>> | T[K] : T[K];
};

/** @complexity O(1). The one deliberate narrowing: a partial bag stands in for the full deps type. */
export function portFake<T extends object>(given: PortFake<T>): T {
  return given as T;
}
