'use client';

import { useChat } from '@ai-sdk/react';
import { type UIMessage } from 'ai';
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from '@/components/ai-elements/tool';
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { CopyIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type TextPart = {
  type: 'text';
  text: string;
};

type PersistedMessage = {
  _id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

function getMessageText(parts: readonly unknown[]) {
  return parts
    .filter((part): part is TextPart => {
      if (!part || typeof part !== 'object') {
        return false;
      }

      const maybePart = part as Partial<TextPart>;
      return maybePart.type === 'text' && typeof maybePart.text === 'string';
    })
    .map(part => part.text)
    .join('');
}

function renderMessageParts(parts: readonly unknown[]) {
  return parts.map((part, index) => {
    if (!part || typeof part !== 'object') {
      return null;
    }

    const typedPart = part as any;

    switch (typedPart.type) {
      case 'text':
        return (
          <MessageResponse key={`text-${index}`}>
            {typedPart.text}
          </MessageResponse>
        );

      case 'thinking':
      case 'reasoning':
        return (
          <Reasoning key={`reasoning-${index}`} defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>{typedPart.content || ''}</ReasoningContent>
          </Reasoning>
        );

      case 'tool-call':
      case 'tool-result':
      case 'dynamic-tool':
        const toolPart = typedPart as ToolPart;
        const isDynamicTool = toolPart.type === 'dynamic-tool';
        
        return (
          <Tool key={`tool-${index}`} className="scale-90 origin-top-left">
            {isDynamicTool ? (
              <ToolHeader
                type={toolPart.type as 'dynamic-tool'}
                state={toolPart.state}
                toolName={toolPart.toolName}
              />
            ) : (
              <ToolHeader
                type={toolPart.type}
                state={toolPart.state}
              />
            )}
            <ToolContent>
              {(toolPart as any).input && (
                <ToolInput input={(toolPart as any).input} />
              )}
              {((toolPart as any).output || (toolPart as any).errorText) && (
                <ToolOutput
                  output={(toolPart as any).output}
                  errorText={(toolPart as any).errorText || ''}
                />
              )}
            </ToolContent>
          </Tool>
        );

      default:
        return null;
    }
  });
}

function getMessageSignature(messages: UIMessage[]) {
  return JSON.stringify(
    messages.map(message => ({
      id: message.id,
      role: message.role,
      text: getMessageText(message.parts),
    }))
  );
}

function toUIMessage(message: PersistedMessage): UIMessage {
  return {
    id: message.clientMessageId ?? message._id,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  };
}

function ConversationChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const createConversation = useMutation(api.chat.createConversation);
  const syncConversationMessages = useMutation(api.chat.syncConversationMessages);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const lastSyncedSignatureRef = useRef('');
  const hydratedConversationIdRef = useRef<string | null>(null);
  const selectedConversationId = searchParams.get('conversationId');

  const persistedMessages = useQuery(
    api.chat.listMessages,
    selectedConversationId
      ? {
          conversationId: selectedConversationId as Id<'conversations'>,
          limit: 500,
        }
      : 'skip'
  );

  const { messages, sendMessage, setMessages, status, stop } = useChat();

  useEffect(() => {
    hydratedConversationIdRef.current = null;
    setEditingId(null);
    setEditingText('');
    lastSyncedSignatureRef.current = '';
  }, [selectedConversationId]);

  const persistedUiMessages = useMemo(
    () => (persistedMessages ?? []).map(message => toUIMessage(message)),
    [persistedMessages]
  );

  const persistedSignature = useMemo(
    () => getMessageSignature(persistedUiMessages),
    [persistedUiMessages]
  );

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    if (persistedMessages === undefined) {
      return;
    }

    setMessages(persistedUiMessages);
    hydratedConversationIdRef.current = selectedConversationId;
    lastSyncedSignatureRef.current = persistedSignature;
  }, [
    persistedMessages,
    persistedSignature,
    persistedUiMessages,
    selectedConversationId,
    setMessages,
  ]);

  useEffect(() => {
    if (
      !selectedConversationId ||
      status !== 'ready' ||
      hydratedConversationIdRef.current !== selectedConversationId
    ) {
      return;
    }

    const nextSignature = getMessageSignature(messages);
    if (!nextSignature || nextSignature === lastSyncedSignatureRef.current) {
      return;
    }

    lastSyncedSignatureRef.current = nextSignature;

    void syncConversationMessages({
      conversationId: selectedConversationId as Id<'conversations'>,
      messages: messages.map(message => ({
        clientMessageId: message.id,
        role: message.role,
        content: getMessageText(message.parts),
      })),
    });
  }, [messages, selectedConversationId, status, syncConversationMessages]);

  const editingMessage = useMemo(
    () => messages.find(message => message.id === editingId),
    [messages, editingId]
  );

  const copyText = async (text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore clipboard errors if browser permissions are restricted.
    }
  };

  const deleteMessage = (messageId: string) => {
    setMessages(current => current.filter(message => message.id !== messageId));

    if (editingId === messageId) {
      setEditingId(null);
      setEditingText('');
    }
  };

  const startEditingUserMessage = (messageId: string, currentText: string) => {
    setEditingId(messageId);
    setEditingText(currentText);
  };

  const saveEditedUserMessage = (messageId: string) => {
    const nextText = editingText.trim();
    if (!nextText) {
      return;
    }

    setMessages(current =>
      current.map(message => {
        if (message.id !== messageId) {
          return message;
        }

        return {
          ...message,
          parts: [{ type: 'text', text: nextText }],
        };
      })
    );

    setEditingId(null);
    setEditingText('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText('');
  };

  const ensureConversation = async () => {
    if (selectedConversationId) {
      return selectedConversationId;
    }

    const result = await createConversation({});
    const nextConversationId = result.conversationId;

    const params = new URLSearchParams(searchParams.toString());
    params.set('conversationId', nextConversationId);
    router.replace(`${pathname}?${params.toString()}`);

    return nextConversationId;
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full flex-col px-4 py-4 sm:px-6">
      <Conversation className="rounded-xl border bg-sidebar">
        <ConversationContent className="p-4">
          {!hasMessages && (
            <ConversationEmptyState
              description="Ask anything to start the conversation."
              title="Your Agentic AI Chat "
            />
          )}

          {messages.map(message => {
            const text = getMessageText(message.parts);
            const isUser = message.role === 'user';
            const isEditing = editingMessage?.id === message.id && isUser;

            return (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {isEditing ? (
                    <div className="flex w-full flex-col gap-2">
                      <textarea
                        className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                        onChange={event => setEditingText(event.currentTarget.value)}
                        value={editingText}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="rounded-md border px-3 py-1.5 text-sm"
                          onClick={cancelEditing}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm"
                          onClick={() => saveEditedUserMessage(message.id)}
                          type="button"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex w-full flex-col gap-4">
                      {renderMessageParts(message.parts)}
                    </div>
                  )}
                </MessageContent>

                <MessageActions
                  className={`transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
                    isUser ? 'ml-auto justify-end' : 'justify-start'
                  }`}
                >
                  <MessageAction
                    label="Copy"
                    onClick={() => void copyText(text)}
                    tooltip="Copy"
                  >
                    <CopyIcon className="size-4" />
                  </MessageAction>

                  {/* {isUser && !isEditing && (
                    <MessageAction
                      label="Edit"
                      onClick={() => startEditingUserMessage(message.id, text)}
                      tooltip="Edit"
                    >
                      <PencilIcon className="size-4" />
                    </MessageAction>
                  )} */}

                  <MessageAction
                    label="Delete"
                    onClick={() => deleteMessage(message.id)}
                    tooltip="Delete"
                  >
                    <Trash2Icon className="size-4" />
                  </MessageAction>
                </MessageActions>
              </Message>
            )
          })}

          {(status === 'streaming' || status === 'submitted') && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking...</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 mt-4 bg-background/95 pb-2 pt-2 backdrop-blur supports-backdrop-filter:bg-background/80">
        <PromptInput
          onSubmit={async ({ text }, event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) {
              return;
            }

            await ensureConversation();
            sendMessage({ text: trimmed });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Type your message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <div />
            <PromptInputSubmit onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export default function Chat() {
  return <ConversationChat />
}