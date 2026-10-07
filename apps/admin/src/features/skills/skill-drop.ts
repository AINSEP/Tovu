import type { DragEvent } from "react";

interface DropEntry {
  name: string; fullPath: string; isFile: boolean; isDirectory: boolean;
  file?(resolve: (file: File) => void, reject: (error: Error) => void): void;
  createReader?(): { readEntries(resolve: (entries: DropEntry[]) => void, reject: (error: Error) => void): void };
}
/** Bounded browser directory walk; no host paths or desktop filesystem read permissions needed. */
async function collect(entries: readonly DropEntry[]) {
  const files: File[] = [], paths: string[] = [];
  let total = 0, visited = 0;
  async function walk(entry: DropEntry, depth: number): Promise<void> {
    if (++visited > 512 || depth > 16) throw new Error("Skill folder has too many entries or is too deep.");
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      total += file.size;
      if (files.length >= 256 || total > 8 * 1024 * 1024) throw new Error("Choose up to 256 files, 8 MiB total.");
      files.push(file); paths.push(entry.fullPath.replace(/^\/+/, ""));
    } else if (entry.isDirectory) {
      const reader = entry.createReader!();
      for (;;) {
        const batch = await new Promise<DropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, depth + 1);
      }
    }
  }
  for (const entry of entries) await walk(entry, 0);
  return { files, paths };
}

/** Capture before ordinary attachment expansion. Non-skill folders retain the host's folder action. */
export function captureSkillDrop(
  { event, proposeFiles, fallback }: {
    event: DragEvent<HTMLElement>;
    proposeFiles: (files: readonly File[], paths?: readonly string[]) => Promise<void>;
    fallback: (event: DragEvent<HTMLElement>) => void;
  },
  { onError = () => {}, interceptFolders = true }: { onError?: (message: string) => void; interceptFolders?: boolean } = {},
): boolean {
  // Snapshot native items synchronously: browsers protect DataTransfer after the event returns.
  const items = Array.from(event.dataTransfer.items ?? []).filter(item => item.kind === "file").map(item => ({ file: item.getAsFile(), entry: item.webkitGetAsEntry?.() as DropEntry | null }));
  const entries = items.flatMap(item => item.entry ? [item.entry] : []);
  const files = Array.from(event.dataTransfer.files ?? []);
  const hasFolder = entries.some(entry => entry.isDirectory);
  // In browsers, Jini already expands folders and preserves relativePath. Its upload callback
  // offers installation for skills; other folders remain ordinary attachments.
  if (hasFolder && !interceptFolders) return false;
  // Every file-only drop must reach the same content-aware uploader as the picker. Capturing ZIPs
  // by suffix here bypasses that classifier and hijacks plugin and ordinary chat attachments.
  if (!hasFolder) return false;
  event.preventDefault(); event.stopPropagation();
  const saved = { ...event, preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: { ...event.dataTransfer, files, types: Array.from(event.dataTransfer.types ?? []), items: items.map(item => ({ kind: "file", getAsFile: () => item.file, webkitGetAsEntry: () => item.entry })) } } as unknown as DragEvent<HTMLElement>;
  void collect(entries).then(({ files: leaves, paths }) => {
    if (leaves.some(file => file.name === "SKILL.md")) return proposeFiles(leaves, paths);
    fallback(saved);
  }).catch(error => onError(error instanceof Error ? error.message : "Could not read skill folder."));
  return true;
}
