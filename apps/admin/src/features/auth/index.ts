/**
 * @file Public surface of the `auth` feature.
 *
 * `panels.tsx` does not import this — `Login` renders before the admin shell mounts and has no
 * `AdminPanel` entry (no nav, not part of the panel registry). `App.tsx` imports from HERE instead.
 * Adding a file to this feature is not an API change unless it is exported from this line.
 */
export { Login } from "./Login";
