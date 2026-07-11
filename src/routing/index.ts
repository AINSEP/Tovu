export {
  getNamedRoute,
  getSlugChangeCapture,
  isActive,
  registerNamedRoute,
  registerResolvePhase,
  registerSlugChangeCapture,
  resolve,
  RouteResolutionError,
  urlFor,
} from "./routing";
export type {
  IsActiveOptional,
  IsActiveRequired,
  RegisterNamedRouteInput,
  ResolveInput,
  ResolveOptional,
  ResolveRequired,
  UrlForOptional,
  UrlForRequired,
} from "./routing";
export type { RouteResolverDeps } from "./ports";
export type {
  EntryRefTarget,
  RouteRefTarget,
  RouteResolveContext,
  RouteResolvePhaseHandler,
  RouteResolvePhaseName,
  RouteResolvePhaseOutcome,
  RouteResolveResult,
  RouteTarget,
  RouteTargetKind,
  RouteUrl,
  SlugChangeCapture,
  SlugChangeCaptureInput,
  TermRefTarget,
  UrlTarget,
} from "./types";
