"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { PlayIcon, Trash2Icon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { getStoredLocalAiSettings } from "@/lib/ai/local-settings";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function SavedWorkflowsPage() {
  const router = useRouter();
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);

  const savedWorkflows = useQuery(api.workflows.listSavedWorkflows, { limit: 100 });
  const createConversation = useMutation(api.chat.createConversation);
  const createWorkflowFromSaved = useMutation(api.workflows.createWorkflowFromSaved);
  const deleteSavedWorkflow = useMutation(api.workflows.deleteSavedWorkflow);

  const items = useMemo(() => savedWorkflows ?? [], [savedWorkflows]);

  const handleRun = async (savedWorkflowId: string, name: string) => {
    setRunningWorkflowId(savedWorkflowId);

    try {
      const created = await createConversation({
        title: `Run: ${name}`,
        firstMessage: `Run saved workflow: ${name}`,
      });

      const workflowResult = await createWorkflowFromSaved({
        savedWorkflowId: savedWorkflowId as any,
        conversationId: created.conversationId,
      });

      const executeRes = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflowResult.workflowId,
          localAiSettings: getStoredLocalAiSettings(),
        }),
      });

      if (!executeRes.ok) {
        throw new Error('Failed to execute saved workflow');
      }

      router.push(`/dashboard?conversationId=${created.conversationId}&workflowId=${workflowResult.workflowId}`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to run saved workflow.');
    } finally {
      setRunningWorkflowId(null);
    }
  };

  const handleDelete = async (savedWorkflowId: string) => {
    setDeletingWorkflowId(savedWorkflowId);

    try {
      await deleteSavedWorkflow({ savedWorkflowId: savedWorkflowId as any });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to delete saved workflow.');
    } finally {
      setDeletingWorkflowId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Saved Workflows</h1>
        <p className="text-sm text-muted-foreground">Run reusable workflows in a new chat with one click.</p>
      </div>

      {savedWorkflows === undefined && (
        <div className="rounded-xl border bg-sidebar p-6 text-sm text-muted-foreground">Loading workflows...</div>
      )}

      {savedWorkflows !== undefined && items.length === 0 && (
        <div className="rounded-xl border bg-sidebar p-6 text-sm text-muted-foreground">
          No saved workflows yet. Complete a workflow, then bookmark it from the workflow dialog.
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((workflow: any) => {
            const isRunning = runningWorkflowId === workflow._id;
            const isDeleting = deletingWorkflowId === workflow._id;

            return (
              <div
                key={workflow._id}
                className="flex items-center justify-between gap-4 rounded-xl border bg-sidebar p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{workflow.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatDate(workflow.updatedAt)} • Runs {workflow.runCount}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={isRunning || isDeleting}
                    onClick={() => void handleRun(workflow._id, workflow.name)}
                  >
                    <PlayIcon className="size-4" />
                    {isRunning ? 'Running...' : 'Play'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-destructive hover:bg-muted disabled:opacity-50"
                    disabled={isRunning || isDeleting}
                    onClick={() => void handleDelete(workflow._id)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
