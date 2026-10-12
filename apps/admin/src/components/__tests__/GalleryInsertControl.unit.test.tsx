import { describe, it, expect } from 'vitest';
import { act, renderHook, render, screen, fireEvent } from '@/__tests__/fetch-query-render';
import { EmbedInsertControl } from '../EmbedInsertControl/EmbedInsertControl';
import { useEmbedInsertControl, type EmbedEditor } from '../EmbedInsertControl/EmbedInsertControl.hooks';
import type { WidgetPickerPort } from '../WidgetPickerDialog/widget-picker-port.hooks';

describe('Insert Gallery', () => {
  it('adds Gallery to the existing Insert menu and opens the pinned gallery control', () => {
    const picked: string[] = [];
    const editor: EmbedEditor = { commands: { insertWidgetEmbed: () => true, insertMediaEmbed: () => true } };
    const fakeUseEmbed: typeof useEmbedInsertControl = () => {
      const state = useEmbedInsertControl(editor);
      return { ...state, open: true, galleryControl: { ...state.galleryControl, setPickerType: type => { if (type) picked.push(type); } } };
    };
    render(<EmbedInsertControl editor={editor} useEmbed={fakeUseEmbed} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gallery' }));
    expect(picked).toEqual(['gallery']);
  });
  it('creates a Gallery through the widget owner and inserts a widgetEmbed; existing Gallery uses the same path', async () => {
    const placements: { placementId: string; widgetEntryId: string }[] = [];
    const creations: Parameters<WidgetPickerPort['createWidget']>[0][] = [];
    const editor: EmbedEditor = { commands: { insertMediaEmbed: () => true, insertWidgetEmbed: attrs => { placements.push(attrs); return true; } } };
    const port: WidgetPickerPort = {
      listWidgets: async () => ({ widgets: [] }),
      createWidget: async input => { creations.push(input); return { widget: { id: 'created-gallery', workspaceId: 'ws', title: input.title, slug: 'gallery', status: 'active', widgetType: input.widgetType, config: input.config, version: 1, updatedAt: '' } }; },
    };
    const { result } = renderHook(() => useEmbedInsertControl(editor, { widgetPort: port, mintPlacementId: () => 'placement-gallery' }));
    act(() => result.current.galleryControl.setPickerType('gallery'));
    await act(async () => result.current.galleryControl.handleCreateNew('Gallery', { images: [], layout: 'grid' }));
    expect(creations).toEqual([{ widgetType: 'gallery', title: 'Gallery', config: { images: [], layout: 'grid' } }]);
    expect(placements).toEqual([{ placementId: 'placement-gallery', widgetEntryId: 'created-gallery' }]);
    act(() => result.current.galleryControl.setPickerType('gallery'));
    act(() => result.current.galleryControl.handleUseExisting('existing-gallery'));
    expect(placements[1]).toEqual({ placementId: 'placement-gallery', widgetEntryId: 'existing-gallery' });
  });
});
