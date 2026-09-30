import type { AdminSourceControlProviderDescriptor } from "@/lib/api";
import { accessTokenProviders } from "../rules";
import { PUBLISH_TARGETS } from "../../deployment/__tests__/publish-targets.fixture";

/**
 * @file The Access Tokens page's provider list as the hook builds it from a loaded deploy registry
 * and source-control host list — the deployment tests' fixture hosts, then three source-control
 * hosts (Bitbucket's form declares a required Username) — for this folder's tests.
 */
export const SOURCE_CONTROL_TEST_DESCRIPTORS: readonly AdminSourceControlProviderDescriptor[] = [
  {
    id: "github",
    label: "GitHub",
    credential: {
      tokenPageUrl: "https://github.com/settings/personal-access-tokens/new",
      help: "Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the \"repo\" scope also works, but reaches every repository this account can access — prefer the fine-grained token.",
      tokenField: "token",
      fields: [{ name: "token", label: "Access token", required: true, secret: true }],
    },
  },
  {
    id: "gitlab",
    label: "GitLab",
    credential: {
      tokenPageUrl: "https://docs.gitlab.com/user/project/settings/project_access_tokens/",
      help: "Needs a project access token.",
      tokenField: "token",
      fields: [{ name: "token", label: "Access token", required: true, secret: true }],
    },
  },
  {
    id: "bitbucket",
    label: "Bitbucket",
    credential: {
      tokenPageUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
      help: "Needs a Bitbucket API token.",
      tokenField: "token",
      fields: [
        { name: "token", label: "Access token", required: true, secret: true },
        { name: "username", label: "Username", required: true, userHelp: "The Bitbucket username this API token belongs to." },
      ],
    },
  },
];

export const ACCESS_TOKEN_TEST_PROVIDERS = accessTokenProviders(PUBLISH_TARGETS, SOURCE_CONTROL_TEST_DESCRIPTORS);
