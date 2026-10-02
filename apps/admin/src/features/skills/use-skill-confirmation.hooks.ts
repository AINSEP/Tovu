import { useEffect, useRef, type MouseEvent } from "react";
import { useFocusTrap } from "../../hooks/use-focus-trap.hooks";
import type { useSkillInstall } from "./use-skill-install.hooks";

/** Sibling dialog behavior: Escape, contained Tab navigation and focus return. */
export function useSkillConfirmation(active: boolean, onCancel: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, active);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { previous?.focus(); };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onCancel]);
  function onDialogClick(event: MouseEvent<HTMLDivElement>) { event.stopPropagation(); }
  return { dialogRef, onDialogClick };
}

export function useSkillInstallConfirmation(install: ReturnType<typeof useSkillInstall>) {
  const confirmation = useSkillConfirmation(install.pending !== null, install.cancel);
  return {
    ...confirmation,
    source: install.pending && "githubUrl" in install.pending ? install.pending.githubUrl : "Uploaded skill files",
    onConfirm: () => { void install.confirm(); },
  };
}
