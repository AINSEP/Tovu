import { describeApiError } from "@/lib/admin-http/request";
import { requestAssistantPrompt } from "@jini-ai/admin/shell/lib/assistant-prompt-bus";
import { liveImportPrompt, validWebsiteAddress } from "./site-transfer-rules";
import type { passwordProblemFor } from "./site-transfer-rules";
import type { SiteImportController, useSiteImport } from "./use-site-transfer.hooks";
import type { useSiteImportState } from "./use-site-import-state.hooks";
import type { createSiteImportAction, createSiteOwnerAction } from "./site-import-actions";

export function createSiteImportController(
  {
    savedKeysPassword, setSavedKeysPassword, unavailable, list, t, link, setLink, file, chooseFiles, setFile, importing, importError, startImport, current,
    setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner, liveAddress, setLiveAddress,
    arrivedForImport,
  }:
    Pick<ReturnType<typeof useSiteImportState>, "savedKeysPassword" | "setSavedKeysPassword" | "unavailable" | "list" | "link" | "setLink" | "file"
    | "chooseFiles" | "setFile" | "importing" | "importError" | "current" | "setPassword" | "setConfirm" | "setCurrent" | "setOwnerError" | "password" | "confirm"
    | "settingOwner" | "ownerError" | "liveAddress" | "setLiveAddress" | "arrivedForImport"> &
    Pick<Parameters<typeof useSiteImport>[0], "t"> &
    Pick<ReturnType<typeof createSiteImportAction>, "startImport"> &
    Pick<ReturnType<typeof createSiteOwnerAction>, "completeOwner"> &
    { passwordProblem: ReturnType<typeof passwordProblemFor> }
) : SiteImportController {
  return {
    savedKeysPassword,
    setSavedKeysPassword,
    imports: unavailable ? [] : list.data?.imports,
    listError: list.error && !unavailable ? describeApiError({ e: list.error, fallback: t("Couldn't load imports.") }) : null,
    link,
    setLink,
    file,
    chooseFiles,
    clearFile: () => setFile(null),
    canImport: !unavailable && (Boolean(file) || link.trim().length > 0),
    importing,
    importError: importError ?? unavailable,
    startImport,
    current,
    ...createSiteImportOwnerController({ setSavedKeysPassword, setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner }),
    liveAddress,
    setLiveAddress,
    liveAddressValid: validWebsiteAddress({ address: liveAddress }),
    startLiveImport: () => {
      if (validWebsiteAddress({ address: liveAddress })) requestAssistantPrompt({ text: liveImportPrompt({ address: liveAddress }) });
    },
    arrivedForImport,
  };
}

function createSiteImportOwnerController({ setSavedKeysPassword, setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner }: { setSavedKeysPassword: Parameters<typeof createSiteImportController>[0]["setSavedKeysPassword"]; setPassword: Parameters<typeof createSiteImportController>[0]["setPassword"]; setConfirm: Parameters<typeof createSiteImportController>[0]["setConfirm"]; setCurrent: Parameters<typeof createSiteImportController>[0]["setCurrent"]; setOwnerError: Parameters<typeof createSiteImportController>[0]["setOwnerError"]; password: Parameters<typeof createSiteImportController>[0]["password"]; confirm: Parameters<typeof createSiteImportController>[0]["confirm"]; passwordProblem: Parameters<typeof createSiteImportController>[0]["passwordProblem"]; settingOwner: Parameters<typeof createSiteImportController>[0]["settingOwner"]; ownerError: Parameters<typeof createSiteImportController>[0]["ownerError"]; completeOwner: Parameters<typeof createSiteImportController>[0]["completeOwner"] }): Pick<SiteImportController, "resume" | "password" | "setPassword" | "confirm" | "setConfirm" | "passwordProblem" | "settingOwner" | "ownerError" | "completeOwner"> {
  return {
    resume: ({ item }, _optional = {}) => {
      setSavedKeysPassword("");
      setPassword("");
      setConfirm("");
      setCurrent(item);
      setOwnerError(null);
    },
    password,
    setPassword,
    confirm,
    setConfirm,
    passwordProblem,
    settingOwner,
    ownerError,
    completeOwner,
  };
}
