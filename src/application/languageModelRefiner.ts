import * as vscode from 'vscode';
import { replaceTaskPackGuidance, TaskPack } from '../domain/taskPack';
import { renderTaskPackMarkdown } from '../domain/taskPackRenderer';

interface RefinedTaskPackPayload {
  goal?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
  verificationCommands?: string[];
}

export async function refineTaskPackWithLanguageModel(
  pack: TaskPack,
  token: vscode.CancellationToken
): Promise<TaskPack | undefined> {
  if (!vscode.lm?.selectChatModels) {
    return undefined;
  }

  const models = await vscode.lm.selectChatModels({});
  const [model] = models;
  if (!model) {
    return undefined;
  }

  const prompt = [
    'Refine this AI coding task pack. Return only JSON with keys goal, constraints, acceptanceCriteria, verificationCommands.',
    'Do not add unrelated scope. Keep constraints and criteria concrete.',
    '',
    renderTaskPackMarkdown(pack),
  ].join('\n');

  const response = await model.sendRequest([
    vscode.LanguageModelChatMessage.User(prompt),
  ], {}, token);

  let text = '';
  for await (const fragment of response.text) {
    text += fragment;
  }

  const payload = parseRefinedPayload(text);
  if (!payload) {
    return undefined;
  }

  return replaceTaskPackGuidance(pack, payload);
}

function parseRefinedPayload(text: string): RefinedTaskPackPayload | undefined {
  const json = extractJson(text);
  if (!json) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(json) as Partial<RefinedTaskPackPayload>;
    return {
      goal: typeof parsed.goal === 'string' ? parsed.goal : undefined,
      constraints: normalizeStringArray(parsed.constraints),
      acceptanceCriteria: normalizeStringArray(parsed.acceptanceCriteria),
      verificationCommands: normalizeStringArray(parsed.verificationCommands),
    };
  } catch {
    return undefined;
  }
}

function extractJson(text: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((entry) => String(entry).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}
