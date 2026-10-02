import yauzl from "yauzl";
import { decodeSkillBase64, MAX_SKILL_BYTES, MAX_SKILL_FILES, MAX_SKILL_FILE_BYTES, SkillInputError, validateSkillPath, type SkillUploadFile } from "./validation.js";

/** Reads ZIP content only; never extracts archive paths or executes bundled code.
 * @complexity O(compressed + decompressed bytes), bounded to 8 MiB and 256 files.
 */
async function readArchive(base64: string): Promise<SkillUploadFile[]> {
  const zip = await yauzl.fromBufferPromise(decodeSkillBase64(base64), { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
  const files: SkillUploadFile[] = [];
  let total = 0;
  let count = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (++count > MAX_SKILL_FILES) throw new SkillInputError("A skill archive may contain at most 256 entries.");
      validateSkillPath(entry.fileName.replace(/\/$/, ""));
      const mode = entry.externalFileAttributes >>> 16;
      const type = mode & 0xf000;
      if (type && type !== 0x8000 && type !== 0x4000) throw new SkillInputError("Skill archives may contain only regular files and directories.");
      if (entry.fileName.endsWith("/")) continue;
      if (entry.uncompressedSize > MAX_SKILL_FILE_BYTES) throw new SkillInputError("Skill archive file exceeds 1 MiB.");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          total += chunk.length;
          if (size > MAX_SKILL_FILE_BYTES || total > MAX_SKILL_BYTES) throw new SkillInputError("Skill archive exceeds its decompressed size limit.");
          chunks.push(Buffer.from(chunk));
        }
      } finally { stream.destroy(); }
      files.push({ path: entry.fileName, contentBase64: Buffer.concat(chunks).toString("base64") });
    }
    return files;
  } finally { zip.close(); }
}

/** Converts malformed archive parser failures into a client-actionable validation refusal. */
export async function readSkillArchive(base64: string): Promise<SkillUploadFile[]> {
  try { return await readArchive(base64); }
  catch (error) {
    if (error instanceof SkillInputError) throw error;
    throw new SkillInputError("Could not read skill ZIP. Use a valid ZIP with regular files only.");
  }
}
