import { randomUUID } from "node:crypto";
import type { Express } from "express";

import {
  mailActivityGetRoute, mailActivityListRoute, mailFeedbackRoute, mailSuppressionRemoveRoute, mailSuppressionsListRoute, mailUsesRoute,
  type MailActivityFailure,
} from "@jini-ai/cms/admin-http/routes/system/mail-activity";
import { mailDnsStatusRoute, mailDnsVerifyRoute } from "@jini-ai/cms/admin-http/routes/system/mail-dns";
import { mailProviderActivateRoute, mailProviderCredentialPlanRoute, mailProvidersListRoute } from "@jini-ai/cms/admin-http/routes/system/mail-providers";
import { mailStatusRoute } from "@jini-ai/cms/admin-http/routes/system/mail-status";
import { mailTestSendRoute } from "@jini-ai/cms/admin-http/routes/system/mail-test-send";
import {
  getMailActivity, listMailActivity, listMailSuppressions, MailActivityForbiddenError, MailActivityUnavailableError, MailSuppressionsUnavailableError,
  planMailSuppressionRemoval, readMailActivityId, readMailActivityQuery, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval,
} from "@jini-ai/platform/mail";
import { mailDnsPorts, readMailDnsStatus, verifyMailDnsStatus, type DnsChangeToolDeps } from "#src/features/domain-dns/index";
import type { MailDeliveryToolDeps } from "#src/features/mail-status/delivery-tool-registrations";
import { mailDomainDepsFrom } from "#src/features/mail-status/domain-deps";
import { readMailFeedbackSetup } from "#src/features/mail-status/feedback-setup";
import { MAIL_STATUS_PERMISSION } from "#src/features/mail-status/permissions";
import { activateMailProvider, planMailProviderCredential, readMailProviderConfigurations } from "#src/features/mail-status/provider-operations";
import { mailUseReadinessDepsFrom, readMailUseReadiness } from "#src/features/mail-status/use-readiness";
import { planMailTestSend, readTestRecipient, runMailTestSend, type MailTestSendDeps } from "#src/features/mail-status/test-send";
import { isMailDeliveryAvailable } from "#src/platform/mail/index";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import {
  classifyMailProviderError, registerAdminMailProviderCredentialSaveRoute, type AdminMailProviderDeps,
} from "#src/server/inbound/admin-http/routes/system/mail-providers";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The `system/mail-*` admin registrars (status, providers, DNS, test send, activity): Jini
 * route specs (`@jini-ai/cms/admin-http/routes/system/mail-*`) mounted behind the admin ports.
 * `RouteDeps` is read only here, at registration: each mount builds that route's own small deps
 * object, so a spec never sees the whole bag. The Tovu-owned collaborators the specs need (the live
 * mailer, the provider-aware status cache, the mail operations) are bound here too, and read per
 * request, because boot swaps the resolved mailer and status source in after the routes are mounted.
 * Registration order is the original order (`mount-admin-system.ts`'s `mountMail`).
 */

/** The deps `registerAdminMailStatusRoute` reads. */
export type AdminMailStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "mailer" | "mailStatus">;

/** `GET .../system/mail-status` (Jini spec): `direct` authorization and the route's own failure copy, as the hand-written route answered.
 * @complexity O(1) setup.
 */
export function registerAdminMailStatusRoute({ app, deps }: { app: Express; deps: AdminMailStatusDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: mailStatusRoute, deps: {
    workspaceId: deps.workspaceId,
    // Read per request, as the hand-written route read `deps.authorize`, so a later reassignment is honoured.
    authorize: (params) => deps.authorize(params),
    // Boot swaps the resolved mailer in after mount (see `platform/mail/delivery-availability.ts`), so read it live.
    isMailDeliveryAvailable: () => isMailDeliveryAvailable(deps.mailer),
    // A root without a resolved mailer has no status source: the body then carries only availability.
    mailStatus: async (optional) => (deps.mailStatus ? { ...(await deps.mailStatus(optional)) } : {}),
  } }, { authorization: "direct", failure: { operation: "routes/system/mail-status", code: "INTERNAL_ERROR" } });
}

/** The four mail-provider routes, in their original order: list, credential plan, credential save, activate.
 * List, plan and activate are Jini specs, all `direct` (the hand-written routes called `deps.authorize`
 * themselves) with the one `routes/system/mail-providers` failure copy. The credential save STAYS
 * hand-written (K1 STOP: it reads `res.locals.authCredentialKind` for the owner-session gate).
 * `mailProviderControl` is read per request, as the hand-written routes read it.
 * @complexity O(1) setup; one provider operation per request.
 */
export function registerAdminMailProviderRoutes({ app, deps }: { app: Express; deps: AdminMailProviderDeps }, _optional: Record<string, never> = {}): void {
  const options = { authorization: "direct", failure: { operation: "routes/system/mail-providers", code: "INTERNAL_ERROR" } } as const;
  const ports = { workspaceId: deps.workspaceId, authorize: (params: Parameters<AdminMailProviderDeps["authorize"]>[0]) => deps.authorize(params), classifyMailProviderError };
  mountAdminJsonRoute({ app, spec: mailProvidersListRoute, deps: { ...ports,
    readMailProviderConfigurations: () => readMailProviderConfigurations({ control: deps.mailProviderControl }) } }, options);
  mountAdminJsonRoute({ app, spec: mailProviderCredentialPlanRoute, deps: { ...ports,
    planMailProviderCredential: ({ providerId }) => planMailProviderCredential({ control: deps.mailProviderControl, providerId }) } }, options);
  registerAdminMailProviderCredentialSaveRoute({ app, deps });
  mountAdminJsonRoute({ app, spec: mailProviderActivateRoute, deps: { ...ports,
    activateMailProvider: ({ providerId, principalId }) => activateMailProvider({ control: deps.mailProviderControl, providerId, principalId }) } }, options);
}

/** The deps `registerAdminMailDnsRoutes` reads. */
export interface AdminMailDnsDeps {
  workspaceId: string;
  /** The DNS change deps the `dns_*` tools use, built for this workspace by the composition root. */
  dns: DnsChangeToolDeps;
}

/** The two mail DNS routes (Jini specs): `direct` authorization through the DNS deps' own authorizer, as the hand-written routes did.
 * Both operations run over fresh `mailDnsPorts` per request. Same operations as the assistant's `mail_dns_status`/`mail_dns_verify`.
 * @complexity O(1) setup.
 */
export function registerAdminMailDnsRoutes({ app, deps }: { app: Express; deps: AdminMailDnsDeps }, _optional: Record<string, never> = {}): void {
  const ports = { workspaceId: deps.workspaceId, authorize: (params: Parameters<DnsChangeToolDeps["authorize"]>[0]) => deps.dns.authorize(params) };
  const options = { authorization: "direct", failure: { operation: "routes/system/mail-dns", code: "INTERNAL_ERROR" } } as const;
  mountAdminJsonRoute({ app, spec: mailDnsStatusRoute, deps: { ...ports, readMailDnsStatus: () => readMailDnsStatus({}, mailDnsPorts(deps.dns)) } }, options);
  mountAdminJsonRoute({ app, spec: mailDnsVerifyRoute, deps: { ...ports, verifyMailDnsStatus: () => verifyMailDnsStatus({}, mailDnsPorts(deps.dns)) } }, options);
}

/** The deps `registerAdminMailTestSendRoute` reads. */
export type AdminMailTestSendDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & MailTestSendDeps;

/** `POST .../system/mail-test-send` (Jini spec): `direct` authorization. The host binds the recipient rules, a fresh idempotency
 * key and the plan-then-run send (the operation `mail_send_test` runs).
 * @complexity One authorization, one user lookup, one settings read and at most one delivery.
 */
export function registerAdminMailTestSendRoute({ app, deps }: { app: Express; deps: AdminMailTestSendDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: mailTestSendRoute, deps: {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    readTestRecipient: (required) => readTestRecipient(required),
    newRequestId: () => randomUUID(),
    sendTestMail: async ({ principalId, to, ref }) => {
      const plan = await planMailTestSend({ principalId, ...(to === undefined ? {} : { to }), deps });
      return runMailTestSend({ principalId, plan, ref, deps });
    },
  } }, { authorization: "direct", failure: { operation: "routes/system/mail-test-send", code: "INTERNAL_ERROR" } });
}

/** The deps `registerAdminMailActivityRoutes` reads. */
export type AdminMailActivityDeps = MailDeliveryToolDeps;

/** The platform's own error classes, as the Jini spec's answers: a missing grant inside an operation, or no activity/suppression repo. */
function classifyMailActivityError(error: unknown, _optional: Record<string, never> = {}): MailActivityFailure | undefined {
  if (error instanceof MailActivityForbiddenError) return { kind: "forbidden", permission: error.permission };
  if (error instanceof MailActivityUnavailableError || error instanceof MailSuppressionsUnavailableError) return { kind: "unavailable", message: error.message };
  return undefined;
}

/** The six activity routes (Jini specs): `direct` authorization, as the hand-written routes consulted `deps.authorize` themselves.
 * The platform operations run per request over `mailDomainDepsFrom`, which authorizes each answer's own permission.
 * Same operations as `mail_get_readiness`, `mail_list_activity`, `mail_get_activity` and the suppression/feedback tools.
 * @complexity One readiness pass or one activity read per request.
 */
export function registerAdminMailActivityRoutes({ app, deps }: { app: Express; deps: AdminMailActivityDeps }, _optional: Record<string, never> = {}): void {
  const mount = { authorization: "direct", failure: { operation: "routes/system/mail-activity", code: "INTERNAL_ERROR" } } as const;
  const shared = { workspaceId: deps.workspaceId, authorize: (params: Parameters<AdminMailActivityDeps["authorize"]>[0]) => deps.authorize(params), classifyMailActivityError };
  const domain = () => mailDomainDepsFrom({ deps });
  const status = {
    ...shared, statusPermission: MAIL_STATUS_PERMISSION,
    checkPermission: ({ principalId, permission }: { principalId: string; permission: string }) => deps.authorize({ principalId, permission, workspaceId: deps.workspaceId, entityType: "mail" }),
  };
  mountAdminJsonRoute({ app, spec: mailUsesRoute, deps: { ...status, readMailUseReadiness: () => readMailUseReadiness(mailUseReadinessDepsFrom(deps)) } }, mount);
  mountAdminJsonRoute({ app, spec: mailActivityListRoute, deps: { ...shared,
    listMailActivity: ({ principalId, input }) => listMailActivity({ principalId, query: readMailActivityQuery({ input }), deps: domain() }) } }, mount);
  mountAdminJsonRoute({ app, spec: mailActivityGetRoute, deps: { ...shared,
    getMailActivity: async ({ principalId, activityId }) => (await getMailActivity({ principalId, activityId: readMailActivityId({ value: activityId }), deps: domain() })) ?? undefined } }, mount);
  mountAdminJsonRoute({ app, spec: mailSuppressionsListRoute, deps: { ...shared,
    listMailSuppressions: ({ principalId, input }) => listMailSuppressions({ principalId, query: readMailSuppressionQuery({ input }), deps: domain() }) } }, mount);
  mountAdminJsonRoute({ app, spec: mailSuppressionRemoveRoute, deps: { ...shared,
    planSuppressionRemoval: async ({ principalId, input }) => {
      const plan = await planMailSuppressionRemoval({ principalId, input: readMailSuppressionRemoval({ input }), deps: domain() });
      return { plan, revision: plan.revision, remove: () => runMailSuppressionRemoval({ principalId, plan, deps: domain() }) };
    } } }, mount);
  mountAdminJsonRoute({ app, spec: mailFeedbackRoute, deps: { ...status, readMailFeedbackSetup: () => readMailFeedbackSetup(deps) } }, mount);
}
