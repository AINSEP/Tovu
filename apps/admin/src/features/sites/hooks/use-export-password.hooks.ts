import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@jini-ai/ui";
import { describeApiError } from "@/lib/admin-http/request";
import type { Translate } from "@jini-ai/core/text";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";

/** Fetch a password only in response to completion or Reveal. It never enters query caches.
 * Request generations discard late responses after dismissal, a new export, or unmount.
 * @returns Memory-only display state and explicit reveal/copy/dismiss actions.
 * @complexity O(1), one HTTP request per reveal and one clipboard operation per copy.
 */
export function useExportPassword({ port, t, canManageSavedKeys, identity, clipboard }: {
  port: SiteTransferPort; t: Translate; canManageSavedKeys: boolean; identity: string; clipboard?: Pick<Clipboard, "writeText">;
}, _options = {}) {
  const [revealedPassword, setRevealedPassword] = useState<{ shareId: string; password: string } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRevealedPassword(null);
    setRevealingId(null);
    setPasswordCopied(false);
    setPasswordError(null);
    return () => { generation.current += 1; };
  }, [identity, canManageSavedKeys]);

  function hidePassword() {
    generation.current += 1;
    setRevealedPassword(null);
    setRevealingId(null);
    setPasswordCopied(false);
    setPasswordError(null);
  }

  async function revealPassword({ shareId }: { shareId: string }, _optional = {}) {
    if (!canManageSavedKeys) return;
    hidePassword();
    const request = generation.current;
    setRevealingId(shareId);
    try {
      const result = await port.revealSharePassword({ shareId });
      if (request === generation.current) setRevealedPassword({ shareId, password: result.password });
    } catch (failure) {
      if (request === generation.current) setPasswordError(describeApiError({ e: failure, fallback: t("Couldn't reveal the password.") }));
    } finally {
      if (request === generation.current) setRevealingId(null);
    }
  }

  async function copyPassword() {
    if (!revealedPassword || !canManageSavedKeys) return;
    const request = generation.current;
    const copied = await copyToClipboard({ text: revealedPassword.password }, clipboard ? { clipboard: { writeText: ({ text }) => clipboard.writeText(text) } } : {});
    if (request !== generation.current) return;
    setPasswordCopied(copied);
    if (!copied) setPasswordError(t("Couldn't copy the password. Copy it manually."));
  }

  return { revealedPassword: canManageSavedKeys ? revealedPassword : null, passwordError, revealingId, passwordCopied, revealPassword, copyPassword, hidePassword };
}
