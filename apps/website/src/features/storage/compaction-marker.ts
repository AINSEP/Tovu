import path from "node:path";
import type fs from "node:fs/promises";
import { z } from "zod";
import type { SqliteCompactionMarker, SqliteCompactionMarkerStore } from "@jini-ai/core/contracts/storage";

export function compactionMarkerStore(
  { opsDir, files, lease }: { opsDir: string; files: Pick<typeof fs, "readFile" | "writeFile" | "mkdir" | "open" | "rename">; lease: { isHeld(): boolean } },
  _optional: Record<string, never> = {},
): { forDatabase(required: { name: "content" | "chat" }, optional?: Record<string, never>): SqliteCompactionMarkerStore & { clear(): Promise<void> } } {
  const fields = { recoveryCopyPath: z.string(), at: z.number().finite() };
  const marker = z.discriminatedUnion("state", [
    z.strictObject({ ...fields, state: z.literal("copying") }),
    z.strictObject({ ...fields, state: z.literal("copied") }),
    z.strictObject({ ...fields, state: z.literal("rewriting") }),
    z.strictObject({ ...fields, state: z.literal("converted"), identity: z.string() }),
    z.strictObject({ ...fields, state: z.literal("needs-attention"), reason: z.string() }),
  ]);
  const schema = z.strictObject({ v: z.literal(1), entries: z.strictObject({ content: marker.optional(), chat: marker.optional() }) });
  const file = path.join(opsDir, "maintenance.json");
  const read = async () => {
    let text: string;
    try { text = await files.readFile(file, "utf8"); }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return schema.parse({ v: 1, entries: {} }); throw error; }
    return schema.parse(JSON.parse(text));
  };
  return { forDatabase: ({ name }, _options = {}) => {
    const write = async (value: SqliteCompactionMarker | undefined): Promise<void> => {
      if (!lease.isHeld()) throw new Error("Storage maintenance no longer owns this website.");
      const record = await read();
      if (value === undefined) delete record.entries[name];
      else record.entries[name] = marker.parse(value);
      await files.mkdir(opsDir, { recursive: true });
      const temp = `${file}.tmp`;
      await files.writeFile(temp, JSON.stringify(record));
      const handle = await files.open(temp, "r");
      try { await handle.sync(); } finally { await handle.close(); }
      if (!lease.isHeld()) throw new Error("Storage maintenance no longer owns this website.");
      await files.rename(temp, file);
      const directory = await files.open(opsDir, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    };
    return { read: async () => (await read()).entries[name], write, clear: () => write(undefined) };
  } };
}
