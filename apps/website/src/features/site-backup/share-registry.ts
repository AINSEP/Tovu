import { randomInt, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";

export interface SiteShareRecord {
  readonly shareId: string;
  readonly token: string;
  readonly site: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string | null;
  readonly status: "active" | "revoked" | "failed";
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly storage?: { readonly provider: string; readonly key: string; readonly url?: string; readonly binding?: string };
}
const ID = /^[0-9a-f-]{36}$/;
/** Owner decision 2026-10-25: share tokens are 16 ASCII letters (~91 bits), short enough to read
 * aloud yet unguessable. No digits, and no other shape is accepted: old 64-hex links are dead.
 * The one source of the token shape; route and object-store key checks build on SHARE_TOKEN_PATTERN. */
export const SHARE_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SHARE_TOKEN_LENGTH = 16;
export const SHARE_TOKEN_PATTERN = `[A-Za-z]{${SHARE_TOKEN_LENGTH}}`;
export const SHARE_TOKEN = new RegExp(`^${SHARE_TOKEN_PATTERN}$`);
export const SHARE_FILE = /^[a-z0-9][a-z0-9-]{0,79}\.tovu\.zip$/;

/**
 * Moves a share catalog from its old home (`ops/shares` beside the source site's database, used
 * before 2026-10-27) to the private one outside the site, once, so existing links and revokes keep working.
 * A copy then remove covers a move across volumes; the copy goes to a `.partial` sibling renamed into
 * place only once complete, so a copy cut short is redone next boot rather than mistaken for an adopted
 * catalog. No-op when the new folder exists or the old is absent.
 * A share this server delivered itself saved its catalog folder as the binding; those are re-pointed at
 * the new folder, or revoke would look for a remote delivery that no longer exists.
 * @complexity O(catalog files).
 */
export function adoptLegacyShareDirectory(required: { from: string; to: string }, _optional: Record<string, never> = {}): void {
  if (existsSync(required.to) || !existsSync(required.from)) return;
  mkdirSync(path.dirname(required.to), { recursive: true, mode: 0o700 });
  // The registry is built on real paths: the old binding is `realpath(from)`, the new one `realpath(to)`.
  // Rewritten before the move, so an interrupted adoption leaves the old folder for the next boot to finish.
  rebindLegacyRecords({ directory: required.from, from: realpathSync(required.from), to: path.join(realpathSync(path.dirname(required.to)), path.basename(required.to)) });
  try { renameSync(required.from, required.to); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    const partial = `${required.to}.partial`;
    rmSync(partial, { recursive: true, force: true });
    cpSync(required.from, partial, { recursive: true });
    renameSync(partial, required.to);
    rmSync(required.from, { recursive: true, force: true });
  }
}

/** Re-points every record bound to this server's folder `from` at `to`; atomic per record, idempotent.
 * @complexity O(catalog files). */
function rebindLegacyRecords(required: { directory: string; from: string; to: string }): void {
  for (const name of readdirSync(required.directory)) {
    if (!name.endsWith(".json") || !ID.test(name.slice(0, -5))) continue;
    const file = path.join(required.directory, name);
    const row = readLegacyRecord({ file });
    if (row?.storage?.provider !== "tovu-server" || row.storage.binding !== required.from) continue;
    const temp = path.join(required.directory, `.${randomUUID()}.tmp`);
    writeFileSync(temp, JSON.stringify({ ...row, storage: { ...row.storage, binding: required.to } }), { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  }
}

/** An unreadable record cannot be bound to this server: it moves as-is rather than disabling every share. */
function readLegacyRecord(required: { file: string }): SiteShareRecord | undefined {
  try { return JSON.parse(readFileSync(required.file, "utf8")) as SiteShareRecord; }
  catch (error) { if (error instanceof SyntaxError) return undefined; throw error; }
}

/**
 * Private per-site share catalog, outside every backup walk and public static root. One atomic
 * metadata file per export prevents unrelated concurrent creates from overwriting each other.
 * Revocation is a permanent create-only tombstone: a racing upload can never resurrect access.
 * @complexity O(exports) listing; O(1) token lookup/updates, plus artifact bytes on disk.
 */
export class SiteShareRegistry {
  readonly directory: string;
  constructor(required: { directory: string }, _optional: Record<string, never> = {}) { this.directory = required.directory; }
  private meta(id: string): string {
    if (!ID.test(id)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid shareId." });
    return path.join(this.directory, `${id}.json`);
  }
  artifactPath(required: { shareId: string }, _optional: Record<string, never> = {}): string {
    this.meta(required.shareId);
    return path.join(this.directory, `${required.shareId}.tovu.zip`);
  }
  /** Immutable token-to-id claim gives O(1) public lookups and forbids replay after revocation. */
  async reserveToken(required: { token: string; shareId: string }, _optional: Record<string, never> = {}): Promise<void> {
    if (!SHARE_TOKEN.test(required.token)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid share token." });
    this.meta(required.shareId);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, `${required.token}.token`);
    try { await writeFile(file, required.shareId, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await readFile(file, "utf8") !== required.shareId) throw new SiteShareRefusal({ code: "TOKEN_EXISTS", message: "This share token has already been used. Create a new export." });
    }
  }
  async put(required: { record: SiteShareRecord }, _optional: Record<string, never> = {}): Promise<void> {
    await this.reserveToken(required.record);
    await this.writeRecord(required.record);
  }
  /** Atomic metadata write with no token-shape check, so `disable` can still tombstone a row minted
   * before the 16-letter switch (its token was reserved when it was created). */
  private async writeRecord(record: SiteShareRecord): Promise<void> {
    const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(record), { flag: "wx", mode: 0o600 });
      await rename(temp, this.meta(record.shareId));
    } finally { await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  async get(required: { shareId: string; site?: string }, _optional: Record<string, never> = {}): Promise<SiteShareRecord | null> {
    let row: SiteShareRecord;
    try { row = JSON.parse(await readFile(this.meta(required.shareId), "utf8")) as SiteShareRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    if (required.site !== undefined && row.site !== required.site) return null;
    try {
      const revokedAt = await readFile(path.join(this.directory, `${row.shareId}.revoked`), "utf8");
      return { ...row, status: "revoked", revokedAt };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return row;
  }
  async list(required: { site?: string }, _optional: Record<string, never> = {}): Promise<SiteShareRecord[]> {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const rows: SiteShareRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") || !ID.test(name.slice(0, -5))) continue;
      const row = await this.get({ shareId: name.slice(0, -5), ...required });
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async findToken(required: { token: string; file: string }, _optional: Record<string, never> = {}): Promise<SiteShareRecord | null> {
    if (!SHARE_TOKEN.test(required.token) || !SHARE_FILE.test(required.file)) return null;
    let shareId: string;
    try { shareId = await readFile(path.join(this.directory, `${required.token}.token`), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const row = await this.get({ shareId });
    return row?.token === required.token && row.file === required.file && row.status === "active" ? row : null;
  }
  async disable(required: { shareId: string; site: string }, _optional: Record<string, never> = {}): Promise<SiteShareRecord | null> {
    const row = await this.get(required);
    if (!row) return null;
    const revokedAt = row.revokedAt ?? new Date().toISOString();
    try { await writeFile(path.join(this.directory, `${row.shareId}.revoked`), revokedAt, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const revoked = { ...row, status: "revoked" as const, revokedAt };
    await this.writeRecord(revoked);
    return revoked;
  }
  async writeArtifact(required: { shareId: string; bytes: Buffer }, _optional: Record<string, never> = {}): Promise<void> {
    if (required.bytes.length > SHARE_LIMITS.maxArchiveBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB archive cap." });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const space = await statfs(this.directory);
    if (space.bavail * space.bsize < required.bytes.length + 16 * 1024 * 1024) throw new SiteShareRefusal({ code: "INSUFFICIENT_STORAGE", message: "Insufficient private storage for this ZIP and 16 MiB of working space." });
    await writeFile(this.artifactPath(required), required.bytes, { flag: "wx", mode: 0o600 });
  }
  async deleteArtifact(required: { shareId: string }, _optional: Record<string, never> = {}): Promise<void> {
    await unlink(this.artifactPath(required)).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

/**
 * A fresh share id and public token. `randomInt` draws from the CSPRNG and rejection-samples, so each
 * of the 52 letters is equally likely (no modulo bias): 16 draws give log2(52^16) ≈ 91 bits.
 * @complexity O(SHARE_TOKEN_LENGTH).
 */
export function newShareIdentity(_required: Record<string, never>, _optional: Record<string, never> = {}): { shareId: string; token: string } {
  const token = Array.from({ length: SHARE_TOKEN_LENGTH }, () => SHARE_TOKEN_ALPHABET[randomInt(SHARE_TOKEN_ALPHABET.length)]).join("");
  return { shareId: randomUUID(), token };
}
