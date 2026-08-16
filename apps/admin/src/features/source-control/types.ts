/**
 * @file Wire types for the Source Control connection page — re-exported from `lib/api.ts`, where
 * every other admin feature's wire types live, right beside the `api.*` methods that use them
 * (`AdminPublishCredentialSummary` and its four `listPublishCredentials`/`createPublishCredential`/
 * `updatePublishCredential`/`deletePublishCredential` siblings are the precedent this feature
 * follows). These types used to be declared locally here — a dispatch file-boundary artifact from
 * before this feature's backend slice existed — and now fold into `lib/api.ts` proper per that
 * feature's own handoff note, leaving this file as a thin re-export so every other module in this
 * feature (`rules.ts`, the hooks, `SourceControl.tsx`) keeps importing from `"../types"`/`"./types"`
 * unchanged.
 */
export type {
  AdminSourceControlConnectionInput,
  AdminSourceControlCredentialSummary,
  AdminSourceControlCredentialsSnapshot,
  AdminSourceControlProviderId,
} from "../../lib/api";
