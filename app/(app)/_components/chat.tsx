'use client';

import { useChat } from '@ai-sdk/react';
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
import { CopyIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';

type TextPart = {
  type: 'text';
  text: string;
};

const getMessageText = (parts: readonly unknown[]) =>
  parts
    .filter((part): part is TextPart => {
      if (!part || typeof part !== 'object') {
        return false;
      }

      const maybePart = part as Partial<TextPart>;
      return maybePart.type === 'text' && typeof maybePart.text === 'string';
    })
    .map(part => part.text)
    .join('');

export default function Chat() {
  const { messages, sendMessage, setMessages, status, stop } = useChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const hasMessages = messages.length > 0;

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

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full  flex-col px-4 py-4 sm:px-6">
      <Conversation className="rounded-xl border bg-sidebar">
        <ConversationContent className="p-4">
          {!hasMessages && (
            <ConversationEmptyState
              description="Ask anything to start the conversation."
              title="Your AI Chat"
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
                    <MessageResponse>{text}</MessageResponse>
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

                  {isUser && !isEditing && (
                    <MessageAction
                      label="Edit"
                      onClick={() => startEditingUserMessage(message.id, text)}
                      tooltip="Edit"
                    >
                      <PencilIcon className="size-4" />
                    </MessageAction>
                  )}

                  <MessageAction
                    label="Delete"
                    onClick={() => deleteMessage(message.id)}
                    tooltip="Delete"
                  >
                    <Trash2Icon className="size-4" />
                  </MessageAction>
                </MessageActions>
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 mt-4 bg-background/95 pb-2 pt-2 backdrop-blur supports-backdrop-filter:bg-background/80">
        <PromptInput
          onSubmit={({ text }, event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) {
              return;
            }

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
  );
}