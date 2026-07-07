import type { ClockPort, UUID } from "../../core/ports";

/**
 * Legacy hardcoded theme ids. Retained as the fallback allowlist when no
 * discovered theme set is injected (keeps pure unit tests hermetic). SPEC-004
 * replaces this with the ids of discovered `valid` themes, passed in via
 * `availableThemeIds` — see `features/theme` + the presentation routes.
 */
export const ALLOWED_THEME_IDS = ["paper", "atlas", "glassmorphic"] as const;
export type ThemeId = (typeof ALLOWED_THEME_IDS)[number];

export interface PresentationSettingsRecord {
  workspaceId: UUID;
  /** Id of the active theme. Validated against discovered themes at write time. */
  activeThemeId: string;
  updatedAt: string;
}

export interface PresentationSettingsRepoPort {
  findByWorkspaceId(workspaceId: UUID): Promise<PresentationSettingsRecord | null>;
  save(record: PresentationSettingsRecord): Promise<void>;
}

export interface GetPresentationSettingsRequired {
  deps: {
    repo: PresentationSettingsRepoPort;
    /** Discovered valid theme ids; falls back to ALLOWED_THEME_IDS when absent. */
    availableThemeIds?: readonly string[];
  };
  input: { workspaceId: UUID };
}

export interface SetActiveThemeDeps {
  clock: ClockPort;
  repo: PresentationSettingsRepoPort;
  /** Discovered valid theme ids; falls back to ALLOWED_THEME_IDS when absent. */
  availableThemeIds?: readonly string[];
}

export interface SetActiveThemeRequired {
  deps: SetActiveThemeDeps;
  input: {
    workspaceId: UUID;
    activeThemeId: string;
  };
}

export interface PresentationOptional {}

export class PresentationSettingsNotFoundError extends Error {}
export class PresentationSettingsValidationError extends Error {}

export async function getPresentationSettings(
  required: GetPresentationSettingsRequired,
  _optional: PresentationOptional = {}
): Promise<{ settings: PresentationSettingsRecord; availableThemeIds: string[] }> {
  const settings = await required.deps.repo.findByWorkspaceId(required.input.workspaceId);
  if (!settings) {
    throw new PresentationSettingsNotFoundError(
      `presentation settings for workspace '${required.input.workspaceId}' were not found`
    );
  }

  return {
    settings,
    availableThemeIds: [...(required.deps.availableThemeIds ?? ALLOWED_THEME_IDS)],
  };
}

export async function setActiveTheme(
  required: SetActiveThemeRequired,
  _optional: PresentationOptional = {}
): Promise<{ settings: PresentationSettingsRecord; availableThemeIds: string[] }> {
  const { deps, input } = required;
  const allowed = deps.availableThemeIds ?? ALLOWED_THEME_IDS;
  if (!allowed.includes(input.activeThemeId)) {
    throw new PresentationSettingsValidationError(
      `theme '${input.activeThemeId}' is not supported`
    );
  }

  const existing = await deps.repo.findByWorkspaceId(input.workspaceId);
  if (!existing) {
    throw new PresentationSettingsNotFoundError(
      `presentation settings for workspace '${input.workspaceId}' were not found`
    );
  }

  const settings: PresentationSettingsRecord = {
    ...existing,
    activeThemeId: input.activeThemeId,
    updatedAt: deps.clock.nowIso(),
  };

  await deps.repo.save(settings);

  return {
    settings,
    availableThemeIds: [...allowed],
  };
}
