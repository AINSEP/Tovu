import { useFetchMutation, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useAlwaysAllow, type AlwaysAllowController } from "@jini-ai/admin/screens/providers/hooks/use-always-allow.hooks";
import { tProviders as defaultT } from "../../../lib/i18n-common";
import { defaultAlwaysAllowPort } from "./always-allow-dependencies.hooks";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useAlwaysAllow`: the real external-MCP approvals
 * port, the host's locale and translator, and the host's query/mutation hooks.
 */

/** The zero-argument pair `AlwaysAllowPanel` mounts: the real port and the real locale. */
export function useWiredAlwaysAllow(): AlwaysAllowController {
  const locale = useAdminLocale();
  return useAlwaysAllow({ port: defaultAlwaysAllowPort, t: (key) => defaultT({ locale: locale, key: key }), locale: locale, useFetchQuery, useFetchMutation });
}
