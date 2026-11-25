import "@jini-ai/admin/screens/skills/skills.css";
import { useSkillInstallConfirmation } from "@jini-ai/admin/screens/skills/use-skill-confirmation.hooks";
import type { SkillsScreenClassNames } from "@jini-ai/admin/screens/skills/skills-screen.types";
import { SKILL_FAILURE_HOST } from "./skill-failure-host";

/**
 * This app's design-system classes for the Skills screen's shared page, card, notice, button,
 * dialog and jini-plugin-row looks, bound once here for the Skills page and the chat dock alike.
 */
export const SKILLS_HOST_CLASSNAMES: SkillsScreenClassNames = {
  page: "page", section: "settings-ui-section", notice: "notice", card: "card", emptyState: "empty-state",
  pageDescription: "page-description", rows: "agent-plugin-rows", fieldHint: "field-hint",
  dialogBackdrop: "settings-dialog-backdrop", dialog: "settings-dialog", noticeError: "notice error", editorActions: "editor-actions",
  buttonPrimary: "btn-primary", buttonSecondary: "btn-secondary", buttonDanger: "btn-danger",
  // The summary line above clips this same string to one line (`.jini-agent-plugin-row-desc`,
  // `-webkit-line-clamp: 1`) — a hover tooltip covers a sighted mouse user, but expanding
  // the row is the only path assistive tech and touch have, so the full text repeats here,
  // unclamped, first — before every other per-plugin fact this panel already held.
  row: "jini-agent-plugin-row", rowMain: "jini-agent-plugin-row-main", rowSummary: "jini-agent-plugin-row-summary", rowGlyph: "jini-agent-plugin-row-glyph",
  rowText: "jini-agent-plugin-row-text", rowHeading: "jini-agent-plugin-row-heading", rowName: "jini-agent-plugin-row-name", rowDesc: "jini-agent-plugin-row-desc",
  iconButton: "jini-agent-plugin-icon-btn", rowActions: "jini-agent-plugin-row-actions", state: "jini-agent-plugin-state", switch: "jini-agent-plugin-switch",
  switchKnob: "jini-agent-plugin-switch-knob", rowDetail: "jini-agent-plugin-row-detail", detailDescription: "jini-agent-plugin-detail-description",
};

/**
 * @file What `@jini-ai/admin`'s `SkillInstallConfirmation` needs from this app wherever it renders
 * (the Skills page and the chat dock): its dialog-behavior hook, the Skills failure bindings and the host classes.
 * Importing it also loads this feature's stylesheet, which the dock has no other route to.
 */
export const SKILL_INSTALL_CONFIRMATION_HOST = { hooks: { useSkillInstallConfirmation }, failureHost: SKILL_FAILURE_HOST, classNames: SKILLS_HOST_CLASSNAMES } as const;
