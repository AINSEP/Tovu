import { randomBytes, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { createSiteKeyEnsurer, type EnsureSiteKeyInput, type EnsureSiteKeyForBootInput, type KeyDependentDataScan } from "@jini-ai/platform/secrets/root-key/ensure";
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from "@jini-ai/platform/fs";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { buildSiteMetaForNewKey } from "#src/platform/site-dir/index";
import { findSiteKeyDependentData } from "#src/platform/site-dir/site-key-dependent-data";
import { readSiteKeySourceMaterial, readSiteMetaJson, resolveSiteKeyFingerprint, resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-read-bindings";

const effects = {
  env: () => process.env,
  resolveRuntimeMode,
  home: homedir,
  cwd: () => process.cwd(),
  siteKeySources,
  readSiteKeySourceMaterial,
  readSiteMetaJson,
  resolveSiteKeyId,
  resolveSiteKeyFingerprint,
  randomUUID,
  randomBytes,
  metadataFilename: ".site-meta.json",
  fields: { siteKeyId: "siteKeyId", fingerprint: "siteKeyFingerprint" },
  buildSiteMetaForNewKey,
  writeJsonFileAtomic: ({ filePath, data }: { filePath: string; data: Record<string, unknown> }) => writeJsonFileAtomic({ filePath, data, fs: createNodeAtomicFilesystem({}, {}) }, {}),
  logBootError: ({ siteDir, error }: { siteDir: string; error: unknown }) => console.error(`[site-key] could not ensure a site key at boot for ${siteDir}: ${(error as Error).message}`),
  fs,
  nowIso: () => new Date().toISOString(),
  pid: process.pid,
  directoryMode: 0o700,
  fileMode: 0o600,
};

export const { installSiteKey, mintSiteKeyHex, atomicCreateSiteKeyFile } = createSiteKeyEnsurer({ ...effects, findSiteKeyDependentData });
export const ensureSiteKey = (input: EnsureSiteKeyInput & { findSiteKeyDependentData: KeyDependentDataScan }, _optional = {}) => createSiteKeyEnsurer({ ...effects, findSiteKeyDependentData: required => input.findSiteKeyDependentData(required) }).ensureSiteKey(input);
export const ensureSiteKeyForBoot = (input: EnsureSiteKeyForBootInput & { findSiteKeyDependentData: KeyDependentDataScan }, _optional = {}) => createSiteKeyEnsurer({ ...effects, findSiteKeyDependentData: required => input.findSiteKeyDependentData(required) }).ensureSiteKeyForBoot(input);
export const ensureSiteKeyForSite = (input: EnsureSiteKeyForBootInput & { findSiteKeyDependentData: KeyDependentDataScan }, _optional = {}) => createSiteKeyEnsurer({ ...effects, findSiteKeyDependentData: required => input.findSiteKeyDependentData(required) }).ensureSiteKeyForSite(input);
