import { buildGatedIdentityRegistrations as buildJiniGatedIdentityRegistrations, type IdentityToolDeps } from "@jini-ai/user-management/identity/tool-registrations";
import { buildIdentityRegistrations, identityDerivedRisk, assertCallerHasAnyPermission, normalizeUsername, parseIdentityToolInput } from "@jini-ai/user-management/server";
import { assertUserAccountAction, SelfDeleteError } from "@jini-ai/user-management/identity/delete-user-service";
import { createUsernameChangePort } from "@jini-ai/user-management/identity/username-change-ports";
import type { ToolContributor, ToolRegistration } from "@jini-ai/core";
import type { ChatDeleteSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { Clock } from "@jini-ai/core/primitives";
import type { OutboxPort } from "@jini-ai/core/contracts/events";
import { SECRET_FORM_CARD_DEFINITIONS } from "../../contracts/headless/index.js";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { notConfirmedResult } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { askThenReport, createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

/** Tovu keeps its ISO clock ABI at this adapter; shared service/rationale live in user-management/server. */
export type TovuIdentityToolDeps = Omit<IdentityToolDeps, "clock" | "assertUserAccountAction" | "assertCallerHasAnyPermission" | "defineSecretCardTool" | "askThenReport" | "secretCardOptions" | "secretField" | "formApp" | "outcomeApp" | "notConfirmedResult" | "approvalToolHandler" | "buildIdentityRegistrations" | "identityDerivedRisk" | "normalizeUsername" | "parseIdentityToolInput" | "createUsernameChangePort" | "SelfDeleteError"> & {
  clock: Clock | { nowIso(): string };
  outbox: OutboxPort;
  isInTrash: (required: { principalId: string }, optional?: Record<string, never>) => Promise<boolean>;
};

export function buildGatedIdentityRegistrations(
  routeDeps: TovuIdentityToolDeps,
  surfaces: ChatDeleteSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return buildJiniGatedIdentityRegistrations({ ...routeDeps,
    assertUserAccountAction, assertCallerHasAnyPermission, defineSecretCardTool, askThenReport,
    secretCardOptions: { uriHost: "tovu", text: {
      noEmitter: "IDENTITY_NO_CONFIRMATION_CHANNEL: identity_user_create: this execution context has no interactive " +
        "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
      saveFailure: "The user was not created.",
    } },
    secretField: { ...SECRET_FORM_CARD_DEFINITIONS.identity_user_create?.secretField },
    formApp: { appName: "tovu-identity-user-create", appVersion: "1" },
    outcomeApp: { appName: "tovu-identity-user-create-outcome", appVersion: "1" },
    notConfirmedResult, approvalToolHandler,
    buildIdentityRegistrations, identityDerivedRisk, normalizeUsername, parseIdentityToolInput, createUsernameChangePort, SelfDeleteError,
  }, surfaces);
}

export function contributeIdentityTools(): ToolContributor<TovuIdentityToolDeps, ChatDeleteSurfaceDeps> {
  return { domain: "identity", build: buildGatedIdentityRegistrations, risk: identityDerivedRisk };
}
