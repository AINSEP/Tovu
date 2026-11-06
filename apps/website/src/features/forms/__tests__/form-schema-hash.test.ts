import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSubmissionEvidence, type HtmlFormDefinitionRecord } from '@jini-ai/cms/forms';
import { createContactFormResolver } from '@jini-ai/cms/widgets/resolvers';
import { renderWidgetIr } from '../../../server/inbound/public-http/http/site/render.js';
import { buildFormDestinationManifest } from '../form-destination-manifest.js';

const builder: HtmlFormDefinitionRecord = {
  id: 'form', workspaceId: 'ws', name: 'Contact', slug: 'contact', status: 'active', version: 1,
  createdAt: 'now', updatedAt: 'now', notify: { enabled: false, recipients: [] },
  fields: [{ id: 'email', label: 'Email', type: 'email', required: true }, { id: 'consent', label: 'Original terms', type: 'checkbox', required: true }],
};

test('builder and authored HTML pages share the receiver/native evidence hash', async () => {
  for (const definition of [builder, { ...builder, mode: 'html' as const, html: '<p>Current privacy notice</p><input name="email" type="email"><input type="checkbox" name="consent">' }]) {
    const resolver = createContactFormResolver({ formDefinitionRepo: { findById: async () => definition, findBySlug: async () => definition } });
    const resolved = (await resolver.resolveMany([{ id: 'widget', widgetType: 'contact-form', config: { formDefinitionId: 'form' } }], { workspaceId: 'ws', preview: false })).get('widget');
    assert.equal(resolved?.ok, true);
    if (!resolved?.ok) throw new Error('Expected resolved current form');
    const native = await captureSubmissionEvidence({ definition, capturedAt: 'now', source: 'native' });
    const manifest = buildFormDestinationManifest({ definitions: [definition] });
    assert.equal(manifest[0]!.evidence.schemaHash, native.schemaHash);
    assert.equal(resolved.ir.props.schemaHash, native.schemaHash);
    const html = renderWidgetIr(resolved.ir);
    assert.equal((html.match(/name="_schemaHash"/g) ?? []).length, 1);
    assert.ok(html.includes(`name="_schemaHash" value="${native.schemaHash}"`));
  }
});
