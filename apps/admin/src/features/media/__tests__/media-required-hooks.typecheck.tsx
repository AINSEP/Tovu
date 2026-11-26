import { Media } from "@jini-ai/admin/screens/media/Media";
import { renderMediaPanel } from "@/media-panel";
import type { PanelRouteContext } from "@/panel-contracts";

const mount = renderMediaPanel({ query: new URLSearchParams() } as PanelRouteContext);
const { hooks, ...otherRequiredProps } = mount.props;
const { useMediaHook, ...otherRequiredHooks } = hooks;

<Media {...otherRequiredProps} hooks={{ ...otherRequiredHooks, useMediaHook }} />;
// @ts-expect-error
<Media {...otherRequiredProps} hooks={otherRequiredHooks} />;
