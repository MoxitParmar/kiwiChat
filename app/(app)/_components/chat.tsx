'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [workflowMode, setWorkflowMode] = useState(false);
  const [workflowPlan, setWorkflowPlan] = useState<{ dag: any; workflowId: string | null } | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [isWorkflowDialogOpen, setIsWorkflowDialogOpen] = useState(false);
  const [isStoppingWorkflow, setIsStoppingWorkflow] = useState(false);
  const activeWorkflow = useQuery(
    api.workflows.getWorkflow,
    activeWorkflowId ? { workflowId: activeWorkflowId as any } : 'skip'
  );
  const postedWorkflowSummaryRef = useRef<string | null>(null);
  const lastSyncedSignatureRef = useRef('');
  const hydratedConversationIdRef = useRef<string | null>(null);
  const selectedConversationId = searchParams.get('conversationId');
  const conversationIdRef = useRef<string | null>(selectedConversationId);

  useEffect(() => {
    conversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const persistedMessages = useQuery(
    api.chat.listMessages,
    selectedConversationId
      ? {
          conversationId: selectedConversationId as Id<'conversations'>,
          limit: 500,
        }
      : 'skip'
  );

  const workflowModeRef = useRef(false);
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport: new DefaultChatTransport({
      fetch: async (input, init) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        body.workflowMode = workflowModeRef.current;
        body.conversationId = conversationIdRef.current ?? undefined;

        if (workflowModeRef.current) {
          // For workflow mode, use a plain fetch and handle JSON response
          const res = await fetch(input, {
            ...init,
            body: JSON.stringify(body),
          });
          if (!res.ok) return res;
          const data = await res.json();
          if (data.type === 'workflow-plan') {
            setWorkflowPlan({ dag: data.dag, workflowId: data.workflowId });
          }
          // Return a fake empty stream response so useChat doesn't error
          return new Response(
            new ReadableStream({ start(c) { c.close(); } }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }

        return fetch(input, { ...init, body: JSON.stringify(body) });
      },
    }),
  });

  useEffect(() => { workflowModeRef.current = workflowMode; }, [workflowMode]);

  useEffect(() => {
    hydratedConversationIdRef.current = null;
    setEditingId(null);
    setEditingText('');
    setWorkflowPlan(null);
    setActiveWorkflowId(null);
    setIsWorkflowDialogOpen(false);
    setIsStoppingWorkflow(false);
    postedWorkflowSummaryRef.current = null;
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
    conversationIdRef.current = nextConversationId;

    const params = new URLSearchParams(searchParams.toString());
    params.set('conversationId', nextConversationId);
    router.replace(`${pathname}?${params.toString()}`);

    return nextConversationId;
  };

  const hasMessages = messages.length > 0;

  const extractWorkflowNodeText = (nodeOutput: string | undefined) => {
    if (!nodeOutput) return '';

    try {
      const parsed = JSON.parse(nodeOutput);
      if (typeof parsed?.text === 'string' && parsed.text.trim()) {
        return parsed.text.trim();
      }
      return JSON.stringify(parsed);
    } catch {
      return nodeOutput;
    }
  };

  const formatWorkflowNodeOutput = (nodeOutput: string | undefined) => {
    if (!nodeOutput) {
      return '';
    }

    try {
      const parsed = JSON.parse(nodeOutput);
      const sections: string[] = [];
      const normalizeText = (value: unknown) => {
        if (typeof value !== 'string') {
          return '';
        }

        return value
          .replace(/\*\*/g, '')
          .replace(/`/g, '')
          .replace(/\r/g, '')
          .trim();
      };

      const textValue = normalizeText(parsed?.text);
      const requestValue = normalizeText(parsed?.request);

      if (textValue) {
        sections.push(`text:\n${textValue}`);
      }

      if (requestValue) {
        sections.push(`request:\n${requestValue}`);
      }

      if (parsed?.params !== undefined) {
        let paramsForDisplay: unknown = parsed.params;

        if (
          paramsForDisplay &&
          typeof paramsForDisplay === 'object' &&
          !Array.isArray(paramsForDisplay)
        ) {
          const copy = { ...(paramsForDisplay as Record<string, unknown>) };
          if (typeof copy.request === 'string' && normalizeText(copy.request) === requestValue) {
            delete copy.request;
          }
          if ('toolResults' in copy) {
            delete copy.toolResults;
          }
          paramsForDisplay = copy;
        }

        const hasObjectParams =
          paramsForDisplay &&
          typeof paramsForDisplay === 'object' &&
          !Array.isArray(paramsForDisplay) &&
          Object.keys(paramsForDisplay as Record<string, unknown>).length > 0;

        if (hasObjectParams) {
          sections.push(`params:\n${JSON.stringify(paramsForDisplay, null, 2)}`);
        } else if (typeof paramsForDisplay === 'string' && paramsForDisplay.trim()) {
          sections.push(`params:\n${paramsForDisplay.trim()}`);
        }
      }

      if (sections.length > 0) {
        return sections.join('\n\n');
      }

      return JSON.stringify(parsed, null, 2);
    } catch {
      return nodeOutput;
    }
  };

  const buildWorkflowCompletionSummary = (nodes: any[]) => {
    const completedNodes = nodes.filter((n) => n.status === 'completed');
    if (completedNodes.length === 0) {
      return 'Workflow completed, but there was no output to summarize.';
    }

    const stepLines = completedNodes
      .map((node, index) => {
        const text = extractWorkflowNodeText(node.output);
        if (!text) return '';
        const compactText = text.replace(/\s+/g, ' ').trim();
        const shortText = compactText.length > 220
          ? `${compactText.slice(0, 220)}...`
          : compactText;
        return `${index + 1}. ${node.tool}: ${shortText}`;
      })
      .filter(Boolean);

    return stepLines.length > 0
      ? `Workflow completed:\n${stepLines.join('\n')}`
      : 'Workflow completed successfully.';
  };

  const getWorkflowSummary = (nodes: any[]) => {
    const total = nodes.length;
    const completed = nodes.filter(n => n.status === 'completed').length;
    const failed = nodes.filter(n => n.status === 'failed').length;
    const running = nodes.filter(n => n.status === 'running').length;
    const stopped = nodes.some((n) => typeof n.error === 'string' && n.error.includes('Stopped by user'));
    if (stopped) return { label: 'Workflow stopped', variant: 'stopped' as const };
    if (failed > 0) return { label: 'Workflow failed', variant: 'failed' as const };
    if (completed === total) return { label: 'Workflow complete', variant: 'complete' as const };
    if (running > 0) return { label: `Running — ${completed}/${total} done`, variant: 'running' as const };
    return { label: 'Starting...', variant: 'pending' as const };
  };

  const stopWorkflowExecution = async () => {
    if (!activeWorkflowId || isStoppingWorkflow) {
      return;
    }

    setIsStoppingWorkflow(true);
    try {
      const res = await fetch('/api/workflow/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: activeWorkflowId }),
      });

      if (!res.ok) {
        throw new Error('Failed to stop workflow');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to stop workflow. Check console.');
    } finally {
      setIsStoppingWorkflow(false);
    }
  };

  useEffect(() => {
    if (workflowPlan || activeWorkflowId) {
      setIsWorkflowDialogOpen(true);
    }
  }, [workflowPlan, activeWorkflowId]);

  useEffect(() => {
    if (!activeWorkflowId || !activeWorkflow) {
      return;
    }

    if (activeWorkflow.status === 'completed') {
      if (postedWorkflowSummaryRef.current === activeWorkflowId) {
        return;
      }

      const summary = buildWorkflowCompletionSummary(activeWorkflow.nodes ?? []);
      setMessages((current) => [
        ...current,
        {
          id: `workflow-summary-${activeWorkflowId}`,
          role: 'assistant',
          parts: [{ type: 'text', text: summary }],
        } as UIMessage,
      ]);
      postedWorkflowSummaryRef.current = activeWorkflowId;
      return;
    }

    if (activeWorkflow.status === 'failed') {
      if (postedWorkflowSummaryRef.current === activeWorkflowId) {
        return;
      }

      const failedNode = (activeWorkflow.nodes ?? []).find((node: any) => node.status === 'failed');
      const isStoppedByUser = typeof failedNode?.error === 'string' && failedNode.error.includes('Stopped by user');
      const errorText = failedNode?.error ? ` Error: ${failedNode.error}` : '';
      setMessages((current) => [
        ...current,
        {
          id: `workflow-summary-${activeWorkflowId}`,
          role: 'assistant',
          parts: [{ type: 'text', text: isStoppedByUser ? 'Workflow stopped.' : `Workflow failed.${errorText}` }],
        } as UIMessage,
      ]);
      postedWorkflowSummaryRef.current = activeWorkflowId;
    }
  }, [activeWorkflow, activeWorkflowId, setMessages]);

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

      <Dialog open={isWorkflowDialogOpen} onOpenChange={setIsWorkflowDialogOpen}>
        <DialogContent className="min-w-1/2 max-w-none  h-[90dvh] overflow-hidden p-0">
          <div className="flex h-full min-h-0 flex-col p-6 ">
            <DialogHeader>
              <DialogTitle>{workflowPlan ? 'Workflow plan' : 'Workflow execution'}</DialogTitle>
              <DialogDescription>
                {workflowPlan
                  ? 'Review the generated plan before starting execution.'
                  : 'Monitor progress and stop execution if needed.'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
              {activeWorkflowId && activeWorkflow && (
                <div className="w-full min-w-0 rounded-xl border bg-sidebar p-4">
                  <ol className="flex flex-col gap-2">
                    {activeWorkflow.nodes.map((node: any) => (
                      <li
                        key={node.nodeId}
                        className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {node.nodeId}
                            </span>
                            <span className="truncate font-medium">{node.tool}</span>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              node.status === 'completed'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : node.status === 'failed'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : node.status === 'running'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {node.status === 'running' ? 'Running...' : node.status}
                          </span>
                        </div>

                        {node.status === 'completed' && node.output && (() => {
                          try {
                            return (
                              <pre className="mt-1 max-h-32 w-full max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap wrap-break-word rounded bg-muted p-2 text-xs text-muted-foreground">
                                {formatWorkflowNodeOutput(node.output)}
                              </pre>
                            );
                          } catch {
                            return (
                              <p className="mt-1 text-xs text-muted-foreground">{node.output}</p>
                            );
                          }
                        })()}

                        {node.status === 'failed' && node.error && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {node.error}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>

                  {(() => {
                    const summary = getWorkflowSummary(activeWorkflow.nodes);
                    return (
                      <div
                        className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                          summary.variant === 'complete'
                            ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                            : summary.variant === 'failed'
                            ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
                            : summary.variant === 'stopped'
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {summary.label}
                      </div>
                    );
                  })()}
                </div>
              )}

              {workflowPlan && (
                <div className="w-full min-w-0 rounded-xl border bg-sidebar p-4">
                  <ol className="flex flex-col gap-2">
                    {workflowPlan.dag?.nodes?.map((node: any) => (
                      <li key={node.id} className="min-w-0 rounded-lg border bg-background p-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{node.id}</span>
                        <span className="mx-2 font-medium">{node.tool}</span>
                        {node.dependsOn?.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            after: {node.dependsOn.join(', ')}
                          </span>
                        )}
                        <pre className="mt-1 w-full max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                          {JSON.stringify(node.params, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 shrink-0 justify-between border-t bg-background pt-4 sm:justify-between">
              {activeWorkflowId && activeWorkflow && (
                <button
                  type="button"
                  className="rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  onClick={() => void stopWorkflowExecution()}
                  disabled={isStoppingWorkflow || activeWorkflow.status !== 'running'}
                >
                  {isStoppingWorkflow ? 'Stopping...' : 'Stop workflow'}
                </button>
              )}

              <div className="flex gap-2">
                {workflowPlan && (
                  <>
                    <button
                      type="button"
                      className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground"
                      onClick={async () => {
                        if (!workflowPlan?.workflowId) return;
                        try {
                          const res = await fetch('/api/workflow/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ workflowId: workflowPlan.workflowId }),
                          });
                          if (!res.ok) throw new Error('Failed to start workflow');
                          setActiveWorkflowId(workflowPlan.workflowId);
                          setWorkflowPlan(null);
                        } catch (err) {
                          console.error(err);
                          alert('Failed to start workflow. Check console.');
                        }
                      }}
                    >
                      Approve and run
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-4 py-1.5 text-sm"
                      onClick={() => setWorkflowPlan(null)}
                    >
                      Cancel
                    </button>
                  </>
                )}

              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="sticky bottom-0 mt-4 bg-background/95 pb-2 pt-2 backdrop-blur supports-backdrop-filter:bg-background/80">
        <PromptInput
          onSubmit={async ({ text }, event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) {
              return;
            }

            if (workflowModeRef.current) {
              // Start each workflow request with a clean workflow UI state.
              setWorkflowPlan(null);
              setActiveWorkflowId(null);
              setIsWorkflowDialogOpen(false);
              setIsStoppingWorkflow(false);
              postedWorkflowSummaryRef.current = null;
            }

            await ensureConversation();
            sendMessage({ text: trimmed });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={workflowMode
                ? "Describe your workflow... e.g. Get my GitHub repos and send a summary to Slack"
                : "Type your message..."
              }
            />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex items-center gap-2">
              {(workflowPlan || activeWorkflowId) && (
                <button
                  type="button"
                  onClick={() => setIsWorkflowDialogOpen(true)}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors border-border bg-background text-muted-foreground hover:bg-muted"
                >
                  View workflow
                </button>
              )}
              <button
                type="button"
                onClick={() => setWorkflowMode(prev => !prev)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  workflowMode
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Workflow
              </button>
            </div>
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