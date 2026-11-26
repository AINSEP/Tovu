import type { StaticPublishToolDeps as JiniStaticPublishToolDeps } from '@jini-ai/devops/deploy/site/publish-tool-deps';
import type { SiteConsentService } from '@jini-ai/cookie-consent/site/service';

export type StaticPublishToolDeps = Omit<JiniStaticPublishToolDeps, 'catalog' | 'env' | 'staticPublishPorts' | 'credentialStorePorts' | 'credentialSourceStorePorts' | 'verificationPorts' | 'requireToolPermission' | 'resolveOperatorLocale' | 'gatewayPlan' | 'gatewayConfirm' | 'gatewayExecute' | 'resolveActorClassIdentity' | 'planHashOf' | 'checkToolPublishConsent' | 'defineSecretCardTool' | 'buildOutcomeSurface' | 'askThenReport' | 'secretCardOptions' | 'uriHost' | 'publishOutcomeApp' | 'credentialFormApp' | 'credentialRowLabel' | 'credentialSaveToolId' | 'abortGuardedCredentialRepo' | 'findPluginCredentialCard' | 'applyPluginCredentialCard' | 'assertCredentialFreeField' | 'credentialText' | 'formatCredentialHint' | 'translateCredentialMessage' | 'issueCredentialSetup' | 'toolApprovalConfirmation' | 'approvalToolHandler'> & {
  readonly siteConsent?: Pick<SiteConsentService, 'deploymentCheck'>;
};
