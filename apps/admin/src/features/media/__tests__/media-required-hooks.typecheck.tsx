import { Media } from "../Media";
import { renderMediaPanel } from "@/media-panel";
import type { PanelRouteContext } from "@/panel-contracts";

const mount = renderMediaPanel({ query: new URLSearchParams() } as PanelRouteContext);
const { useMediaHook, ...otherRequiredProps } = mount.props;

<Media {...otherRequiredProps} useMediaHook={useMediaHook} />;
// @ts-expect-error
<Media {...otherRequiredProps} />;
