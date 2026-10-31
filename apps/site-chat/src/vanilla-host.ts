import { createVisitorPageControl } from './visitor-page-control';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { createSiteAssistantTransport } from './site-assistant-transport';
import { clearSiteAssistantState, loadSiteAssistantState, saveSiteAssistantState } from './session-store';
import { installSiteChatComparisonSend } from './site-chat-comparison';
import { createSiteChatI18n } from './site-chat-i18n';
import { createVanillaToolConfirmation } from './vanilla-tool-confirmation';
import { confirmSiteAssistantTool } from './tool-confirmation';

/** Binds the existing product adapters; Jini owns the DOM widget and conversation state. */
export function createSiteVanillaArgs({ element }: { element: HTMLElement }, options: {
  document?: Document;
  /** Full-page navigation for a `navigate` page action; defaults to the page's `location.assign`. */
  assign?: (input: { path: string }) => void;
} = {}) {
  const document = options.document ?? window.document;
  const assign = options.assign ?? (({ path }: { path: string }) => window.location.assign(path));
  const { t } = createSiteChatI18n({ document });
  element.setAttribute('data-agent-private', '');
  const frontend = createVisitorPageControl({ document, beforeNavigate: ({ messages }) => { const state = loadSiteAssistantState(); saveSiteAssistantState({ ...state, messages: messages ?? state.messages }); } }, { assign });
  const showConfirmation = createVanillaToolConfirmation({ element, document }, {
    confirm: input => confirmSiteAssistantTool(input, { headers: frontend.currentHeaders }),
  });
  return { element, document, transport: createSiteAssistantTransport({}, { onToolConfirmation: showConfirmation, frontend }), agentId: 'site-assistant',
    suggestions: [t('What can I find on this site?'), t('Show me the latest posts')],
    directiveEventName: 'client_directive', ids: () => crypto.randomUUID(), createAbortController: () => new AbortController(),
    session: {
      load: () => loadSiteAssistantState(), save: ({ state }: { state: ReturnType<typeof loadSiteAssistantState> }) => saveSiteAssistantState(state),
      clear: () => clearSiteAssistantState(),
    },
    scheduleFrame: ({ callback }: { callback: () => void }) => {
      const handle = requestAnimationFrame(callback); return () => cancelAnimationFrame(handle);
    },
    renderMarkdown: ({ content, element: target }: { content: string; element: HTMLElement }) => {
      // micromark is already installed in this host. Defaults escape raw HTML and reject unsafe
      // protocols; never enable allowDangerousHtml or allowDangerousProtocol for visitor replies.
      // Footnotes are disabled: per-message IDs otherwise collide and expose an unstyled sr-only heading.
      const template = document.createElement('template');
      template.innerHTML = micromark(content, { extensions: [gfm(), { disable: { null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall'] } }], htmlExtensions: [gfmHtml()] });
      // Filter the detached fragment before insertion so an untrusted image never starts a request.
      const base = new URL(document.baseURI);
      for (const image of template.content.querySelectorAll<HTMLImageElement>('img')) {
        const source = image.getAttribute('src');
        if (!source) { image.remove(); continue; }
        try {
          const url = new URL(source, base);
          if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) image.remove();
        } catch { image.remove(); }
      }
      target.replaceChildren(template.content);
      for (const link of target.querySelectorAll<HTMLAnchorElement>('a[href]')) link.rel = 'noopener noreferrer';
    },
    copy: { title: t('Ask this site'), fabLabel: t('Chat with this site'), placeholder: t("Ask about this site's posts and pages…"),
      greeting: t('Ask about posts, pages or docs on this site.'), suggestionsLabel: t('Example prompts'),
      send: t('Send'), stop: t('Stop run'), close: t('Close chat'), reset: t('New thread'), resetQuestion: t('Discard chat?'), confirm: t('Discard chat'), confirmDraft: t('Discard draft'), keep: t('Cancel'),
      thinking: 'Replying…' },
  };
}

/** Called by the build-only entry after Jini has been built; no unbuilt export enters the dev graph. */
export function mountSiteVanillaChat({ mount }: { mount: (args: ReturnType<typeof createSiteVanillaArgs>, options: { initialOpen: boolean }) => {
  controller: { send: (input: { text: string }) => Promise<unknown>; getState: (input: Record<string, never>) => { busy: boolean; error: string | null } };
} }, _options = {}): void {
  const element = document.getElementById('tovu-site-assistant-root');
  if (!element) return;
  const widget = mount(createSiteVanillaArgs({ element }), { initialOpen: element.dataset.chatOpen === 'true' || loadSiteAssistantState().open });
  installSiteChatComparisonSend({ root: element, send: async ({ text }) => {
    if (widget.controller.getState({}).busy) throw new Error('This pane is already replying.');
    await widget.controller.send({ text });
    const error = widget.controller.getState({}).error;
    if (error) throw new Error(error);
  } });
}
