import type { PluginCredentialCard } from "../../../../contracts/core/plugin-credential-card.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadSearchProviderContributionsFromSource } from "../../search-provider-registry.js";
import { parsePluginCredentialCards } from "../../credential-cards.js";
import { bundledContributionSources } from "../../bundled-contribution-sources.js";
import { parseMailAdaptersFile } from "../../mail-adapter-registry.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const filename = "tovu-mail-adapters.json";
const sources = bundledContributionSources({ sourceRoot, filename });

test("bundled mail credential card check discovers contribution packages", () => {
  assert.ok(sources.length > 0, "a missing content root must not turn this check into a silent pass");
});

for (const { pluginId, packageRoot } of sources) {
  test(`${pluginId}: every labelled mail adapter supplies its own usable credential card`, () => {
    const parsed = parseMailAdaptersFile(readFileSync(path.join(packageRoot, filename), "utf8"));
    assert.ok(parsed.ok, `${pluginId}/${filename} must parse`);
    assert.ok(parsed.descriptors.length > 0, `${pluginId} must declare its mail adapters`);
    for (const descriptor of parsed.descriptors) {
      // The parser supplies a default credentialLabel too: omitting the label must not evade the rule.
      assert.ok(descriptor.credentialLabel.trim(), `${pluginId}/${descriptor.id}: missing saved label`);
      assert.equal(descriptor.credentialCardRefusal, undefined, `${pluginId}/${descriptor.id}: invalid card`);
      assert.ok(descriptor.credentialCard, `${pluginId}/${descriptor.id}: credentialLabel requires credentialCard`);
      for (const field of ["title", "intro", "helpUrl", "helpLabel", "keyHint", "baseUrl"] as const) {
        assert.ok(descriptor.credentialCard[field]?.trim(), `${pluginId}/${descriptor.id}: missing credentialCard.${field}`);
      }
    }
  });
}

// Every contribution that accepts a user key uses the same manifest declaration.
const packages = bundledContributionSources({ sourceRoot, filename: 'plugin.json' });
for (const { pluginId, packageRoot } of packages) {
  test(`${pluginId}: declared key and sign-in cards have usable copy and contribution fields`, async () => {
    const raw = readFileSync(path.join(packageRoot, 'plugin.json'), 'utf8');
    const parsed = parsePluginCredentialCards({ raw });
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
    for (const card of parsed.descriptors) {
      for (const field of ['providerId', 'label', 'category', 'title', 'intro', 'keyHint'] as const) assert.ok(card[field]?.trim(), `${pluginId}: missing ${field}`);
      // A provider settings card's destinations are its provider plugin's declared settings; the parser forbids a baseUrl.
      if (card.saveKind === 'provider-settings') assert.ok(card.saveTarget, `${pluginId}: provider settings card needs its provider plugin`);
      else assert.ok(card.baseUrl || card.fields?.some(f => f.name === 'baseUrl' && f.required), `${pluginId}: missing API origin`);
      if (card.helpUrl) assert.ok(card.helpLabel?.trim(), `${pluginId}: missing help label`);
      if (card.saveKind === 'oauth') assert.ok(card.permissions?.trim(), `${pluginId}: missing sign-in permissions`);
    }
    for (const [filename, key, saveKind] of [['tovu-deploy-targets.json', 'targets', 'publish-host'], ['tovu-source-control.json', 'providers', 'source-control']] as const) {
      const file = path.join(packageRoot, filename);
      if (!existsSync(file)) continue;
      for (const descriptor of JSON.parse(readFileSync(file, 'utf8'))[key]) {
        if (!descriptor.credential) continue;
        const card: PluginCredentialCard | undefined = parsed.descriptors.find(c => c.saveKind === saveKind && (c.saveTarget ?? c.providerId) === descriptor.id);
        assert.ok(card, `${pluginId}/${descriptor.id}: credential contribution requires its own card`);
        // Publish-host and source-control forms read their fields from the domain descriptor.
        // The manifest parser forbids parallel field declarations on these routing cards.
        assert.deepEqual(card.fields ?? [], []);
        assert.ok(descriptor.credential.fields.length > 0, `${pluginId}/${descriptor.id}: domain form needs credential fields`);
      }
    }
    if (existsSync(path.join(packageRoot, 'tovu-search-providers.json'))) {
      const providers = await loadSearchProviderContributionsFromSource({ pluginId, packageRoot });
      assert.deepEqual(providers.refusals, []);
      // Published Jini shape: each item carries its definition ({ id, provider }), not module/descriptor.
      for (const { definition } of providers.items) if ((definition.provider.credentialKeys ?? []).length > 0) {
        assert.ok(parsed.descriptors.some(card => card.providerId === definition.id && card.saveKind === 'api'), `${pluginId}: keyed search provider needs a card`);
      }
    }
    for (const filename of ['tovu-deploy-ops.json', 'tovu-credential-schemes.json']) {
      if (existsSync(path.join(packageRoot, filename))) assert.ok(parsed.descriptors.some(card => card.saveKind === 'api'), `${pluginId}: operations and token schemes need a card`);
    }
    const mcp = path.join(packageRoot, 'mcp.json');
    if (existsSync(mcp)) for (const config of Object.values(JSON.parse(readFileSync(mcp, 'utf8')).mcpServers) as Array<{ tovuTokenAuth?: unknown; tovuAuthMode?: string }>) {
      if (config.tovuTokenAuth) assert.ok(parsed.descriptors.some(c => c.saveKind === 'agent-plugin-token'), `${pluginId}: token fallback needs a card`);
    }
  });
}
