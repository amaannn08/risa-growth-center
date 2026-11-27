'use client';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

export interface PageContext { page: string; asOf?: string; attribution?: string; campaignId?: string }
export interface ResolvedDraft { id: string; status: 'confirmed' | 'discarded'; result_ref?: string }

/** Module-level singletons: the side panel and the /copilot page share one conversation. */
export const ctxStore: { ctx: PageContext; resolved: ResolvedDraft[]; conversationId: string } = {
  ctx: { page: 'overview' }, resolved: [], conversationId: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'c0',
};

let chat: Chat<UIMessage> | null = null;
export function getChat(): Chat<UIMessage> {
  if (!chat) {
    chat = new Chat<UIMessage>({
      transport: new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => {
          const resolved = ctxStore.resolved; ctxStore.resolved = [];
          return { body: { messages, conversationId: ctxStore.conversationId, context: { ...ctxStore.ctx, ...(resolved.length ? { resolvedDrafts: resolved } : {}) } } };
        },
      }),
    });
  }
  return chat;
}
export function newConversation() { chat = null; ctxStore.conversationId = crypto.randomUUID(); ctxStore.resolved = []; }
