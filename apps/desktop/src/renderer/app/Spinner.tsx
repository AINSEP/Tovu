/**
 * One small rotating ring — "still working", not its own moment. Shared by `SiteStartPanel`'s
 * server-boot state and `SiteWorkspace`'s own admin-loading overlay, so a press of Start reads as
 * one continuous wait across both phases rather than two different treatments. `aria-hidden`: the
 * text beside it (both call sites render a `role="status"`/adjacent sentence) already carries the
 * accessible message, so an unlabelled decorative spinner would only announce twice.
 */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
