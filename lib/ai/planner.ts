import { generateText } from 'ai';

export interface DagNode {
  id: string;
  tool: string;
  params: Record<string, string>;
  dependsOn: string[];
}

export interface DagJson {
  nodes: DagNode[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export async function runPlanner(
  userMessage: string,
  connectedTools: ToolSchema[]
): Promise<string> {
  const toolDocs = connectedTools
    .map(
      (t) =>
        `Tool: ${t.name}\nDescription: ${t.description}\nParameters schema: ${JSON.stringify(t.parameters, null, 2)}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `You are a workflow planner. The user wants to automate a multi-step task.
Convert their request into a DAG JSON. Return ONLY valid JSON — no explanation, no markdown, no backticks.

Here are the EXACT tools available with their full parameter schemas:

${toolDocs}

Output this exact JSON shape:
{
  "nodes": [
    {
      "id": "n1",
      "tool": "EXACT_TOOL_NAME",
      "params": { "exactParamName": "value" },
      "dependsOn": []
    },
    {
      "id": "n2", 
      "tool": "ANOTHER_EXACT_TOOL_NAME",
      "params": { "exactParamName": "{{n1.output.fieldName}}" },
      "dependsOn": ["n1"]
    }
  ]
}

Rules you MUST follow:
- tool value MUST be one of the exact tool names listed above. Never invent or guess a tool name.
- params keys MUST match the exact parameter names from that tool's parameters schema above.
- dependsOn lists node ids that must fully complete before this node starts.
- Nodes with empty dependsOn array will run in parallel — use this for independent steps.
- Use {{nodeId.output.fieldName}} syntax to pass output from one node as input to another.
- Keep the DAG as simple as possible. Use the minimum number of nodes to complete the task.
- Do not add intermediate nodes for schema discovery or connection checking.
- Only include nodes that directly accomplish the user's stated goal.`;

  // Import the model the same way it is imported in app/api/chat/route.ts
  // Use the same model string already used in this project
  const { text } = await generateText({
    model: "xai/grok-4.1-fast-non-reasoning" as any,
    system: systemPrompt,
    prompt: userMessage,
  });

  return text.trim();
}