import { validateSchedule as validateRoutineSchedule, type RoutineSchedule } from "@jini-ai/daemon";
import { getEffective as getEffectiveSetting, LANGUAGE_NAMESPACE } from "@jini-ai/core/settings";
import type { RoutineActor, RoutineAvailability } from "@tovu/contracts/routines";
import { approvalText } from "#src/contracts/core/approval-i18n";
import type { HumanConfirmSurfaceDeps } from "#src/contracts/core/human-confirm";
import type { RoutineAccess, RoutineCommands } from "#src/features/routines/routine-commands";
import type { RoutineToolHost } from "#src/features/routines/routine-tool-registrations";
import type { AssistantRoutinesHandle } from "./assistant-routines.js";

/**
 * @file Serving composition's supply of the four routine tools (P3-T4.T) and human-confirm's approval
 * receipt port (P3-T3.T) to `createApp` → `mountAssistant`.
 *
 * Why lazy: `createApp` installs the tool contributors synchronously, but the routines handle only
 * exists after the sidecar opens. Rather than reorder boot, every command and every receipt lookup
 * resolves the handle per call, so the tools use the EXACT command gate the admin routes use.
 */

type ReceiptsFor = NonNullable<HumanConfirmSurfaceDeps["approvalReceiptsFor"]>;
type LocaleFor = (required: { principalId: string }) => Promise<string>;
type SettingsRepo = Parameters<typeof getEffectiveSetting>[0]["deps"]["repo"];

export interface ServingRoutineToolsRequired {
  /** Desktop-eligible AND release on: only then do the routines run at all. */
  canRun: boolean;
  /** The host-root `ROUTINES_RELEASE_ENABLED`. */
  releaseEnabled: boolean;
  ready: () => Promise<AssistantRoutinesHandle>;
  /** The same owner check the routine routes use (`ownerAccessFor`). */
  access: RoutineAccess;
  workspaceId: string;
}

/** The owner's approval locale, read like every other approval card's (`tool-registrations.ts` `localeFor`). */
export function settingsLocaleFor({ settingsRepo, workspaceId }: { settingsRepo: SettingsRepo; workspaceId: string }, _optional = {}): LocaleFor {
  return async ({ principalId }) => {
    const setting = await getEffectiveSetting({ deps: { repo: settingsRepo }, namespace: LANGUAGE_NAMESPACE, key: "locale", scopeContext: { workspaceId, principalId } });
    return typeof setting?.value === "string" ? setting.value : "en";
  };
}

/** Each command waits for the composed handle, then calls that handle's own gate. */
function lazyCommands(ready: () => Promise<AssistantRoutinesHandle>): RoutineToolHost["commands"] {
  const on = async () => (await ready()).commands;
  return {
    list: async (...args: Parameters<RoutineCommands["list"]>) => (await on()).list(...args),
    get: async (...args: Parameters<RoutineCommands["get"]>) => (await on()).get(...args),
    create: async (...args: Parameters<RoutineCommands["create"]>) => (await on()).create(...args),
    setEnabled: async (...args: Parameters<RoutineCommands["setEnabled"]>) => (await on()).setEnabled(...args),
    delete: async (...args: Parameters<RoutineCommands["delete"]>) => (await on()).delete(...args),
  };
}

/**
 * Builds the `createApp` options for routine tools and approval receipts.
 * @returns `routines` only when routines can run AND the release flag is on; the receipt port always (undefined until a run is tracked).
 */
export function servingRoutineToolOptions(required: ServingRoutineToolsRequired, { localeFor = async () => "en" }: { localeFor?: LocaleFor } = {}): {
  routines?: RoutineToolHost; routinesReleaseEnabled: boolean; routineApprovalReceiptsFor: ReceiptsFor;
} {
  const { canRun, releaseEnabled, ready, access, workspaceId } = required;
  let handle: AssistantRoutinesHandle | undefined;
  void ready().then((composed) => { handle = composed; }, () => {});
  const routineApprovalReceiptsFor: ReceiptsFor = ({ ctx }) => handle?.approvalBindingFor({ ctx });
  if (!canRun || !releaseEnabled) return { routinesReleaseEnabled: releaseEnabled, routineApprovalReceiptsFor };
  // The owner resolves before every card, so the copy follows the locale read with that check.
  let locale = "en";
  const resolveOwnerActor = async ({ principalId }: { principalId: string }): Promise<RoutineActor | null> => {
    const actor = { principalId, workspaceId };
    if (!(await access({ actor }))) return null;
    locale = await localeFor({ principalId }).catch(() => "en");
    return actor;
  };
  const routines: RoutineToolHost = {
    commands: lazyCommands(ready), resolveOwnerActor,
    validateSchedule: ({ schedule }) => validateRoutineSchedule({ schedule: schedule as RoutineSchedule }),
    // Still composing: "starting" keeps discovery closed and handlers refusing, without the store-open failure copy.
    availability: (): RoutineAvailability => handle?.availability() ?? "starting",
    copy: ({ key }) => approvalText({ locale, key }),
  };
  return { routines, routinesReleaseEnabled: releaseEnabled, routineApprovalReceiptsFor };
}
