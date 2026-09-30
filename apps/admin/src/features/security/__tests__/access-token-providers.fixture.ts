import { accessTokenProviders } from "../rules";
import { PUBLISH_TARGETS } from "../../deployment/__tests__/publish-targets.fixture";

/**
 * @file The Access Tokens page's provider list as the hook builds it from a loaded deploy registry —
 * the deployment tests' fixture hosts, then the source-control providers — for this folder's tests.
 */
export const ACCESS_TOKEN_TEST_PROVIDERS = accessTokenProviders(PUBLISH_TARGETS);
