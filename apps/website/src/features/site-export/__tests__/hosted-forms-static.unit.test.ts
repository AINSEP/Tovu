import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as yauzl from 'yauzl';
import type { FormCollectionProvider } from '@jini-ai/cms/forms';
import type { JsonObject } from '@jini-ai/core/primitives';
import { renderWidgetIr } from '../../../server/inbound/public-http/http/site/render.js';
import { zipFolderFiles } from '@jini-ai/agent-plugins/folder-zip';
import { downloadForms, exportHtml } from '../export-html-policy.js';
import { buildStaticSiteZip } from '../../site-backup/share-zip.js';
import { createShareArchiveReader } from '../../site-backup/import-archive-reader.js';

const publicUrl = 'https://docs.google.com/forms/d/e/FAKE_static-form/viewform';
const widget = (plan: ReturnType<FormCollectionProvider['plan']>, consentOff = false) => renderWidgetIr({ componentId: 'contact-form', props: { slug: 'contact', fields: [], collectionPlan: plan as unknown as JsonObject, collectionConsentOff: consentOff } });

/** Load the real self-contained built artifact through its distribution subpath, never vendor APIs. */
async function provider(): Promise<FormCollectionProvider> {
  const manifest = createRequire(import.meta.url).resolve('@jini-ai/provider-plugins/google-forms');
  const plugin = (await import(pathToFileURL(path.join(path.dirname(manifest), 'server/index.mjs')).href)).default;
  let result: FormCollectionProvider | undefined;
  plugin.definition.setup({ providers: { register(entry: { factory(required: object, optional: object): { port: FormCollectionProvider } }) {
    result = entry.factory({}, {}).port;
  } } });
  assert.ok(result);
  return result;
}

test('the packaged hosted form keeps the same consent and fallback markup through static HTML and ZIP', async () => {
  const plan = (await provider()).plan({ slug: 'contact', config: { url: publicUrl } });
  assert.equal(plan.kind, 'embed');
  const live = widget(plan);
  const html = exportHtml({ html: `<!doctype html><html><head></head><body>${live}</body></html>` });
  const download = downloadForms({ html, page: '/contact' });
  assert.deepEqual(download.removed, []);
  assert.ok(download.html.includes(live));
  assert.doesNotMatch(live, /<iframe[^>]*\ssrc=/);
  assert.match(live, /data-jini-consent="\[&quot;functional&quot;\]"/);
  assert.ok(live.includes(`href="${publicUrl}"`));
  const archive = await buildStaticSiteZip({ copy: {
    filename: 'hosted-static.zip', siteSlug: 'fixture',
    metadata: { exportedAt: '2026-11-05T00:00:00Z', theme: 'fixture', routes: ['/contact'], failed: { routes: [], assets: [] }, skipped: { routes: [], assets: [], references: [] } },
    files: [{ path: 'contact/index.html', content: Buffer.from(download.html) }],
  }, zip: zipFolderFiles });
  let found = false;
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    if (entry.kind !== 'file' || !entry.entryPath.endsWith('/contact/index.html')) continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    const zippedHtml = Buffer.concat(chunks).toString();
    assert.ok(zippedHtml.includes(live));
    assert.doesNotMatch(zippedHtml, /<iframe[^>]*\ssrc=/);
    found = true;
  }
  assert.ok(found, 'the static ZIP must carry the page containing the hosted form');
});

test('the same packaged plan delivers ordinarily in explicit consent-off mode', async () => {
  const plan = (await provider()).plan({ slug: 'contact', config: { url: publicUrl } });
  const html = widget(plan, true);
  assert.ok(html.includes(`<iframe src="${publicUrl}?embedded=true"`));
  assert.match(html, /If this form does not open, open it on Google or contact the site owner\./);
  assert.ok(downloadForms({ html, page: '/contact' }).html.includes(html));
});
