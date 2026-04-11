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

function isValidDagNode(node: DagNode | undefined): boolean {
  return Boolean(
    node?.id &&
    node?.tool &&
    typeof node?.params?.request === 'string' &&
    node.params.request.trim()
  );
}

function parseDagText(text: string): DagJson {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const json = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(json) as DagJson;
}

export async function runPlanner(
  userMessage: string,
): Promise<string> {
  const systemPrompt = `You are a workflow planner. The user wants to automate a multi-step task.
Convert their request into a DAG JSON. Return ONLY valid JSON — no explanation, no markdown, no backticks.

Output this exact JSON shape:
{
  "nodes": [
    {
      "id": "n1",
      "tool": "short action label",
      "params": { "request": "natural language request for this step" },
      "dependsOn": []
    },
    {
      "id": "n2", 
      "tool": "next action label",
      "params": { "request": "step request that can reference previous output like {{n1.output.text}}" },
      "dependsOn": ["n1"]
    }
  ]
}

Rules you MUST follow:
- Return nodes in execution order.
- dependsOn is optional metadata; execution follows node array order.
- Every node MUST include params.request.
- tool must be a concise human-readable label of the step, not a tool slug.
- Use {{nodeId.output.fieldName}} syntax to pass output from one node as input to another.
- Keep the DAG as simple as possible. Use the minimum number of nodes to complete the task.
- Do not add nodes for tool discovery.
- Only include nodes that directly accomplish the user's stated goal.`;

  const { text } = await generateText({
    model: "xai/grok-4.1-fast-non-reasoning" ,
    system: systemPrompt,
    prompt: userMessage,
  });

  let dag = parseDagText(text);
  const hasInvalidNode = (dag.nodes ?? []).some((node) => !isValidDagNode(node));

  if (hasInvalidNode) {
    const retry = await generateText({
      model: "xai/grok-4.1-fast-non-reasoning" ,
      system: systemPrompt,
      prompt: `${userMessage}\n\nYour last DAG was invalid. Regenerate with nodes that all include: id, tool, params.request, dependsOn.`,
    });
    dag = parseDagText(retry.text);

    const stillInvalid = (dag.nodes ?? []).some((node) => !isValidDagNode(node));
    if (stillInvalid) {
      throw new Error('Planner generated an invalid DAG shape after retry.');
    }
  }

  return JSON.stringify(dag, null, 2);
}