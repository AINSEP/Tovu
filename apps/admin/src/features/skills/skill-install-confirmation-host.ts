import "@jini-ai/admin/screens/skills/skills.css";
import { useSkillInstallConfirmation } from "@jini-ai/admin/screens/skills/use-skill-confirmation.hooks";
import type { SkillsScreenClassNames } from "@jini-ai/admin/screens/skills/skills-screen.types";
import { SKILL_FAILURE_HOST } from "./skill-failure-host";

/**
 * This app's design-system classes for the Skills screen's shared page, card, notice, button,
 * dialog and plugin-row looks, bound once here for the Skills page and the chat dock alike.
 */
export const SKILLS_HOST_CLASSNAMES: SkillsScreenClassNames = {
  page: "page", section: "settings-ui-section", notice: "notice", card: "card", emptyState: "empty-state",
  pageDescription: "page-description", rows: "agent-plugin-rows", fieldHint: "field-hint",
  dialogBackdrop: "settings-dialog-backdrop", dialog: "settings-dialog", noticeError: "notice error", editorActions: "editor-actions",
  buttonPrimary: "btn-primary", buttonSecondary: "btn-secondary", buttonDanger: "btn-danger",
  row: "agent-plugin-row", rowMain: "agent-plugin-row-main", rowSummary: "agent-plugin-row-summary", rowGlyph: "agent-plugin-row-glyph",
  rowText: "agent-plugin-row-text", rowHeading: "agent-plugin-row-heading", rowName: "agent-plugin-row-name", rowDesc: "agent-plugin-row-desc",
  iconButton: "agent-plugin-icon-btn", rowActions: "agent-plugin-row-actions", state: "agent-plugin-state", switch: "agent-plugin-switch",
  switchKnob: "agent-plugin-switch-knob", rowDetail: "agent-plugin-row-detail", detailDescription: "agent-plugin-detail-description",
};

/**
 * @file What `@jini-ai/admin`'s `SkillInstallConfirmation` needs from this app wherever it renders
 * (the Skills page and the chat dock): its dialog-behavior hook, the Skills failure bindings and the host classes.
 * Importing it also loads this feature's stylesheet, which the dock has no other route to.
 */
export const SKILL_INSTALL_CONFIRMATION_HOST = { hooks: { useSkillInstallConfirmation }, failureHost: SKILL_FAILURE_HOST, classNames: SKILLS_HOST_CLASSNAMES } as const;
