import { useState } from "react";
import { t as translateForStaticSiteTab } from "./deployment-i18n";

/** Bind this screen's copy to the current locale. */
export function createStaticSiteTabTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForStaticSiteTab({ locale, key });
}

/** Copy one command and expose its temporary feedback state. */
export function useCopyLine({ text }: { text: string }, _options = {}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — see this component's doc.
    }
  }

  return { copied, copy };
}
