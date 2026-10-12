/** Owner mediawidget contract: placement content survives the real TipTap document lifecycle. */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { WidgetEmbed } from '../widget-embed-extension';

it('preserves per-placement content through JSON save/reload alongside styling attrs', () => {
  const content = { mode: 'media', items: [{ slug: 'first', alt: '' }], layout: 'grid' };
  const editor = new Editor({ extensions: [StarterKit, WidgetEmbed], content: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { placementId: 'p', widgetEntryId: 'w', content, cssClass: 'photos', htmlAttributes: 'data-kui="scroll-snap-x"' } }] } });
  try {
    const json = editor.getJSON();
    expect(json.content?.[0]?.attrs?.content).toEqual(content);
    editor.commands.setContent(json);
    expect(editor.getJSON().content?.[0]?.attrs?.content).toEqual(content);
    expect(editor.getJSON().content?.[0]?.attrs?.htmlAttributes).toBe('data-kui="scroll-snap-x"');
  } finally { editor.destroy(); }
});
