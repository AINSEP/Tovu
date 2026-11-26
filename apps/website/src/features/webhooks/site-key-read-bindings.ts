import { existsSync, readFileSync } from "node:fs";
import { createSiteKeySources } from "@jini-ai/platform/secrets/root-key/sources";
import { assertTestHomeIsolation } from "#src/platform/test-home-isolation";

export const SITE_KEY_ENV_VAR_NAME = "TOVU_SITE_KEY";
export const LEGACY_SITE_KEY_FILENAME = "integrations-root-key.hex"; // site-key-legacy: remove on/after 2026-11-01 (D3)

export const {
  siteKeySources, resolveSiteKeyEnv, readSiteMetaJson, resolveSiteKeyId, siteKeyEnvOnlySources,
  readSiteMetaId, siteKeySourcesForSiteDir, resolveSiteKeyFingerprint, siteKeyFilePathFrom, readSiteKeySourceMaterial,
} = createSiteKeySources({
  envName: SITE_KEY_ENV_VAR_NAME,
  metadataFilename: ".site-meta.json",
  fields: { siteId: "siteId", siteKeyId: "siteKeyId", fingerprint: "siteKeyFingerprint" },
  localSegments: [".tovu", "site-keys"],
  sharedSegments: [".tovu", LEGACY_SITE_KEY_FILENAME],
  volumeSegments: ["sites", ".tovu", "site-key.hex"],
  legacyVolumeSegments: ["sites", ".tovu", LEGACY_SITE_KEY_FILENAME],
  assertHomeIsolation: assertTestHomeIsolation,
  fs: { existsSync, readFileSync },
});

export type { SiteKeySource } from "@jini-ai/platform/secrets/root-key/material";
export type SiteKeySourcesInput = Parameters<typeof siteKeySources>[0];
