import { useCallback, useRef, useState } from "react";
import { installSkill, type SkillInstallPayload } from "./api";
import { prepareSkillUpload } from "./skill-upload";

/** Holds an upload until the user confirms. A superseded read cannot install an older drop. */
export function useSkillInstall(onInstalled?: () => void | Promise<void>) {
  const [pending, setPending] = useState<SkillInstallPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const confirmLock = useRef(false);
  const propose = useCallback((payload: SkillInstallPayload) => { ++generation.current; setError(null); setPending(payload); }, []);
  const proposeFiles = useCallback(async (files: readonly File[], paths?: readonly string[]) => {
    const current = ++generation.current;
    setError(null);
    try { const payload = await prepareSkillUpload(files, paths); if (current === generation.current) setPending(payload); }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Could not read skill."); }
  }, []);
  const cancel = useCallback(() => { if (!confirmLock.current) { ++generation.current; setPending(null); setError(null); } }, []);
  const confirm = useCallback(async () => {
    if (!pending || confirmLock.current) return;
    confirmLock.current = true;
    const current = generation.current;
    setBusy(true); setError(null);
    try { await installSkill(pending); if (current === generation.current) setPending(null); await onInstalled?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not install skill."); }
    finally { confirmLock.current = false; setBusy(false); }
  }, [pending, onInstalled]);
  const fail = useCallback((message: string) => setError(message), []);
  return { pending, busy, error, propose, proposeFiles, cancel, confirm, fail };
}
