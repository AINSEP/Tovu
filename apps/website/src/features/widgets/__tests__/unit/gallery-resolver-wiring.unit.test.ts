import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoreResolvers } from '@jini-ai/cms/widgets/resolvers';
import { trashAwareEntryRepo } from '#src/features/entries/__tests__/support/trash-aware-entry-repo';
import { InMemoryFormDefinitionRepo } from '@jini-ai/cms/forms';
import { resolveMenuDoc } from '@jini-ai/cms/navigation';
import { widgetCollectionListPort } from "@jini-ai/cms/entries/site/public-list";

test('core assembly injects the Gallery media port with the render workspace context', async () => {
  const seen: string[] = [];
  const resolvers = createCoreResolvers({
    crypto: globalThis.crypto,
    menus: { resolveMenuDoc },
    collectionList: widgetCollectionListPort,
    entryList: trashAwareEntryRepo(), contentTypes: { findByKey: async () => null },
    navMenuReadModel: { getMenu: async () => null, getMenuBySlug: async () => null, listMenus: async () => [], resolveForLocation: async () => null },
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    galleryMedia: async ({ refs, context }) => { seen.push(context.workspaceId); return new Map(refs.map(ref => [ref.id!, { componentId: 'media-image', props: { assetId: ref.id! } }])); },
  });
  const results = await resolvers.gallery!.resolveMany([{ id: 'gallery-widget', widgetType: 'gallery', config: { images: [{ mediaId: 'one', alt: '' }], layout: 'grid' } }], { workspaceId: 'workspace-gallery', preview: false });
  assert.deepEqual(seen, ['workspace-gallery']); assert.ok(results.get('gallery-widget')?.ok);
});
