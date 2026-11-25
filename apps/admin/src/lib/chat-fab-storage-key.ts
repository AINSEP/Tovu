/**
 * Where every operator's dragged FAB position already lives in `localStorage`. Host-owned (the
 * admin shell's `ChatFab` takes it as a required prop); changing it would silently reset every
 * saved position.
 */
export const FAB_POSITION_STORAGE_KEY = "tovu-admin-fab-position";
