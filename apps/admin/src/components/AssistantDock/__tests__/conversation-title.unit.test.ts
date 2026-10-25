import { describe, expect, it } from 'vitest';
import { deriveConversationTitle } from '@jini-ai/chat/core';
import type { UseAssistantChats } from '@/hooks/use-assistant-chats.hooks';
import { resolveAssistantConversationTitle } from '../hooks/AssistantDock.hooks';

describe('dock conversation title', () => {
  const prompt = 'I want to connect a Mailchimp account';
  const chats: Pick<UseAssistantChats, 'conversations' | 'activeId' | 'initialMessages'> = {
    activeId: 'chat',
    conversations: [{ id: 'chat', title: deriveConversationTitle({ prompt }), titleSource: 'generated', messageCount: 1, createdAt: 1, updatedAt: 1 }],
    initialMessages: [{ id: 'message', role: 'user', content: prompt }],
  };
  it('uses sentence case for the known automatic title', () => {
    expect(resolveAssistantConversationTitle({ chats, fallback: 'Tovu assistant' })).toBe('I want to connect a Mailchimp account');
  });
  it('keeps a manual title verbatim', () => {
    expect(resolveAssistantConversationTitle({ chats: { ...chats, conversations: [{ ...chats.conversations[0]!, title: 'MY name', titleSource: 'manual' }] }, fallback: 'Tovu assistant' })).toBe('MY name');
  });
  it('cleans legacy stored markdown in the panel title without requiring a loaded prompt', () => {
    expect(resolveAssistantConversationTitle({ chats: {
      ...chats, initialMessages: [],
      conversations: [{ ...chats.conversations[0]!, title: 'Page: **Plannie** at **plannie' }],
    }, fallback: 'Tovu assistant' })).toBe('Page: Plannie at **plannie');
  });
  it('uses translated fallback copy when there is no active title', () => {
    expect(resolveAssistantConversationTitle({ chats: { ...chats, activeId: null }, fallback: 'Assistant du site' })).toBe('Assistant du site');
    expect(resolveAssistantConversationTitle({ chats: { ...chats, conversations: [{ ...chats.conversations[0]!, title: null }] }, fallback: 'Assistant du site' })).toBe('Assistant du site');
  });
});
