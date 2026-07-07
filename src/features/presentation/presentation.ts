import type { ClockPort, UUID } from "../../core/ports";

export const ALLOWED_THEME_IDS = ["paper", "atlas", "glassmorphic"] as const;
export type ThemeId = (typeof ALLOWED_THEME_IDS)[number];

export interface PresentationSettingsRecord {
  workspaceId: UUID;
  activeThemeId: ThemeId;
  updatedAt: string;
}

export interface PresentationSettingsRepoPort {
  findByWorkspaceId(workspaceId: UUID): Promise<PresentationSettingsRecord | null>;
  save(record: PresentationSettingsRecord): Promise<void>;
}

export interface GetPresentationSettingsRequired {
  deps: { repo: PresentationSettingsRepoPort };
  input: { workspaceId: UUID };
}

export interface SetActiveThemeDeps {
  clock: ClockPort;
  repo: PresentationSettingsRepoPort;
}

export interface SetActiveThemeRequired {
  deps: SetActiveThemeDeps;
  input: {
    workspaceId: UUID;
    activeThemeId: ThemeId;
  };
}

export interface PresentationOptional {}

export class PresentationSettingsNotFoundError extends Error {}
export class PresentationSettingsValidationError extends Error {}

export async function getPresentationSettings(
  required: GetPresentationSettingsRequired,
  _optional: PresentationOptional = {}
): Promise<{ settings: PresentationSettingsRecord; availableThemeIds: ThemeId[] }> {
  const settings = await required.deps.repo.findByWorkspaceId(required.input.workspaceId);
  if (!settings) {
    throw new PresentationSettingsNotFoundError(
      `presentation settings for workspace '${required.input.workspaceId}' were not found`
    );
  }

  return {
    settings,
    availableThemeIds: [...ALLOWED_THEME_IDS],
  };
}

export async function setActiveTheme(
  required: SetActiveThemeRequired,
  _optional: PresentationOptional = {}
): Promise<{ settings: PresentationSettingsRecord; availableThemeIds: ThemeId[] }> {
  const { deps, input } = required;
  if (!ALLOWED_THEME_IDS.includes(input.activeThemeId)) {
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
    availableThemeIds: [...ALLOWED_THEME_IDS],
  };
}
