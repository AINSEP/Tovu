/**
 * The package owns the captured-versus-server timestamp comparison; the host supplies translated copy.
 * The former feature-local stale predicate compared the draft's base version against the current
 * version (see `PostRepoPort.writeAutosave`), and its separate banner used a caller-supplied clock.
 * That old interpolated banner was untranslated because the static dictionary lacked interpolation;
 * the shared recovery message instead receives the host translator and saved timestamps.
 */
export { standingDraftRecoveryMessage } from "@jini-ai/ui/panel-kit";
