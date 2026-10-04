import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { usePublishToLiveAvailable } from "./publish-availability.store";
import { backstopRunFromSearch } from "./publish-backstop.rules";
import { t as translate } from "../publish-backstop-i18n";
import { usePublishBackstop } from "./use-publish-backstop.hooks";
import type { PublishBackstopPort } from "./publish-backstop-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

export function useWiredPublishBackstop({ port, t: injectedT }: { port?: PublishBackstopPort; t?: Translate } = {}, _optional = {}) {
  const locale = useWiredAdminLocale();
  const canPublish = usePublishToLiveAvailable();
  const t = injectedT ?? ((key: string) => translate(locale, key));
  const runId = backstopRunFromSearch({ search: window.location.search });
  const view = usePublishBackstop({ port, t, runId, canPublish });
  return view;
}
