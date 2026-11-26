import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import * as folderZipModule from "@jini-ai/agent-plugins/folder-zip";
import { FolderZipError } from "@jini-ai/agent-plugins/core/folder-zip-error";
import type { FolderZipPort } from "@jini-ai/admin/shell/components/InstallTabCard/use-folder-upload.hooks";
import { usePlugins, type PluginsController } from "@jini-ai/admin/screens/plugins/hooks/use-plugins.hooks";

import { tPlugins as translate } from "../../../lib/i18n-common";
import { isApiError, pluginRules } from "../rules";
import { defaultPluginInstallPort } from "./plugin-install-dependencies.hooks";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";

/** The folder zipper the Plugins and Agent Plugins "Choose a folder" buttons drive: the `folder-zip` module's
 *  zipper and refusal keys plus the refusal class it throws, which lives in `core/folder-zip-error`. Built
 *  explicitly so a missing member is a type error, not a runtime `instanceof` TypeError (merge-27). */
export const folderZipPort: FolderZipPort = { ...folderZipModule, FolderZipError };
const folderZip = folderZipPort;

/**
 * @file The host binding of Jini's `usePlugins`: this product's `/api/.../plugins` client and install
 * port, the current admin locale and its plugins dictionary, its API-error test and bound rule functions.
 */

/**
 * Binds the real `/api/.../plugins` client, the real `useAdminLocale()`, and a `translatePlugins`-
 * bound translator — see `plugins-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Plugins.tsx` composes this and a test composes `usePlugins` with `createFakePluginsPort`.
 */
export function useWiredPlugins(): PluginsController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return usePlugins({ port: defaultPluginsPort, installPort: defaultPluginInstallPort, locale, t, translate, isApiError, folderZip, rules: pluginRules });
}
