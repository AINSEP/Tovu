/**
 * @file Public surface of the `trash` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder — the same boundary every
 * other feature in this app keeps. Adding a file here is not an API change unless it is exported
 * from this line.
 */
export { Trash } from "./Trash";
