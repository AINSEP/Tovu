import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoreResolvers } from '@jini-ai/cms/widgets/resolvers';
import { TrashAwareInMemoryEntryRepo } from '#src/features/entries/trash-aware-memory-repo';
import { InMemoryFormDefinitionRepo } from '@jini-ai/cms/forms';
import { resolveMenuDoc } from '@jini-ai/cms/navigation';
import { parseCollectionListConfig, entryPublicHref, humanizeFieldName, isCollectionListLayout } from "../../../entries/public-list.js";
import { SYSTEM_CONTENT_TYPES } from "../../../../contracts/core/system-content-types.js";

test('core assembly injects the Gallery media port with the render workspace context', async () => {
  const seen: string[] = [];
  const resolvers = createCoreResolvers({
    menus: { resolveMenuDoc },
    collectionList: { parseCollectionListConfig, entryPublicHref, humanizeFieldName, isCollectionListLayout, systemContentTypes: SYSTEM_CONTENT_TYPES },
    entryList: new TrashAwareInMemoryEntryRepo(), contentTypes: { findByKey: async () => null },
    navMenuReadModel: { getMenu: async () => null, getMenuBySlug: async () => null, listMenus: async () => [], resolveForLocation: async () => null },
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    galleryMedia: async ({ refs, context }) => { seen.push(context.workspaceId); return new Map(refs.map(ref => [ref.id!, { componentId: 'media-image', props: { assetId: ref.id! } }])); },
  });
  const results = await resolvers.gallery!.resolveMany([{ id: 'gallery-widget', widgetType: 'gallery', config: { images: [{ mediaId: 'one', alt: '' }], layout: 'grid' } }], { workspaceId: 'workspace-gallery', preview: false });
  assert.deepEqual(seen, ['workspace-gallery']); assert.ok(results.get('gallery-widget')?.ok);
});
