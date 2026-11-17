import { useCallback, useState } from "react";
import { useAsyncAction } from "@jini-ai/ui/panel-kit";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { sitesApi } from "@/features/sites/api/sites-api";
import { KEYS } from "../rules";

/** Home edits are a settings action; changing it never moves existing site folders. */
export function useSitesHome({ home }: { home: string }, { port = sitesApi }: { port?: Pick<typeof sitesApi, "setSitesHome"> } = {}) {
  const [path, setPath] = useState(home);
  const invalidate = useInvalidate();
  const { saving, error, run } = useAsyncAction();
  const save = useCallback(() => run({ action: async () => {
    const result = await port.setSitesHome({ path });
    setPath(result.home); invalidate({ key: KEYS.list });
  }, describeError: (failure) => failure instanceof Error ? failure.message : String(failure) }), [port, path, run, invalidate]);
  return { path, setPath, save, saving, error };
}
