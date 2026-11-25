import { Trash as TrashView } from "@jini-ai/admin/screens/trash/Trash";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { useWiredTrash } from "./hooks/use-trash.hooks";

/**
 * @file The admin's Trash route: `@jini-ai/admin`'s `Trash` screen bound to this host — the
 * controller hook to its `useWiredTrash` binding and this admin's bound sidebar-label translator.
 */

/**
 * The Trash screen. `useTrashHook` is the DI seam every screen in this app carries — a test mounts
 * this with a controller built over `createFakeTrashPort` instead of stubbing global `fetch`.
 */
export function Trash(props: { useTrashHook?: typeof useWiredTrash } = {}) {
  return <TrashView useTrashHook={props.useTrashHook ?? useWiredTrash} translateAdminNavLabel={translateAdminNavLabel} />;
}
