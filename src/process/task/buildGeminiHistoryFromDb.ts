/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Build Gemini API Content[] history from database messages.
 *
 * Converts DB text and tool_group messages into the Gemini Content[] format
 * that can be passed to GeminiClient.resumeChat() for true session resume.
 */

import type { IMessageText, IMessageToolGroup, TMessage } from '@/common/chatLib';

/**
 * Gemini API Content type (matches @google/genai Content).
 * Defined locally to avoid importing @google/genai in the main process.
 */
type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: unknown } } };

/**
 * Map display name to real Gemini CLI tool name.
 * Only tools we can reliably reconstruct are included.
 */
const DISPLAY_TO_TOOL_NAME: Record<string, string> = {
  Shell: 'run_shell_command',
  ReadFile: 'read_file',
  WriteFile: 'write_file',
  EditFile: 'edit_file',
  ListDir: 'list_dir',
  Search: 'search_files',
  Grep: 'grep',
  GoogleSearch: 'google_search',
  WebFetch: 'web_fetch',
};

/**
 * Extract function call args from a tool_group item's confirmationDetails.
 * Returns null if the item cannot be reliably reconstructed — caller must skip it.
 */
function extractArgsFromToolItem(
  item: IMessageToolGroup['content'][number]
): { toolName: string; args: Record<string, unknown> } | null {
  const details = item.confirmationDetails;
  // No confirmationDetails = display-only item, skip per consensus rule
  if (!details) return null;

  const realName = DISPLAY_TO_TOOL_NAME[item.name];
  // Unknown tool = can't reliably reconstruct, skip
  if (!realName) return null;

  switch (details.type) {
    case 'exec':
      if (!details.command) return null;
      return { toolName: realName, args: { command: details.command } };
    case 'edit':
      if (!details.fileName) return null;
      return {
        toolName: realName,
        args: {
          file_path: details.fileName,
          ...(details.fileDiff ? { file_diff: details.fileDiff } : {}),
        },
      };
    case 'info':
      return {
        toolName: realName,
        args: {
          ...(details.prompt ? { prompt: details.prompt } : {}),
          ...(details.urls?.length ? { urls: details.urls } : {}),
        },
      };
    case 'mcp':
      return {
        toolName: realName,
        args: {
          tool_name: details.toolName,
          server_name: details.serverName,
        },
      };
    default:
      return null;
  }
}

/**
 * Extract a string result from a tool_group item's resultDisplay.
 */
function extractResultFromToolItem(
  item: IMessageToolGroup['content'][number]
): string {
  const rd = item.resultDisplay;
  if (!rd) return '';
  if (typeof rd === 'string') return rd;
  // fileDiff result
  if ('fileDiff' in rd) return `File: ${rd.fileName}\n${rd.fileDiff}`;
  // img_url result
  if ('img_url' in rd) return `Image: ${rd.relative_path}`;
  return '';
}

/**
 * Check if a tool_group item has enough data to form a complete
 * functionCall/functionResponse pair.
 */
function isToolItemComplete(
  item: IMessageToolGroup['content'][number]
): boolean {
  // Must have a name for functionCall
  if (!item.name) return false;
  // Must have a terminal status — skip Executing/Pending/Confirming
  const terminalStatuses = ['Success', 'Error', 'Canceled'];
  if (!terminalStatuses.includes(item.status)) return false;
  // Must have some form of result
  if (item.resultDisplay === undefined || item.resultDisplay === null) {
    // Error/Canceled can have empty result — that's fine, we produce "cancelled" or "error"
    if (item.status === 'Error' || item.status === 'Canceled') return true;
    return false;
  }
  return true;
}

/**
 * Build Gemini API Content[] from database messages.
 *
 * Rules:
 * - text messages: mapped to user (position=right) or model (position=left) Content
 * - tool_group messages: produce 2 Content turns (model functionCall + user functionResponse)
 * - tips messages: skipped
 * - Incomplete tool items within a group: skipped individually
 * - Adjacent same-role Content entries are merged (Gemini API requires alternating roles)
 */
export function buildGeminiHistoryFromDb(messages: TMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.type === 'text') {
      const textMsg = msg as IMessageText;
      const text = textMsg.content.content;
      if (!text?.trim()) continue;

      const role: 'user' | 'model' = textMsg.position === 'right' ? 'user' : 'model';
      contents.push({ role, parts: [{ text }] });
    } else if (msg.type === 'tool_group') {
      const toolGroup = msg as IMessageToolGroup;
      const items = toolGroup.content;
      if (!Array.isArray(items) || items.length === 0) continue;

      // Filter to only complete items
      const completeItems = items.filter(isToolItemComplete);
      if (completeItems.length === 0) continue;

      // Build functionCall parts (model turn)
      const callParts: GeminiPart[] = [];
      // Build functionResponse parts (user turn)
      const responseParts: GeminiPart[] = [];

      for (const item of completeItems) {
        const extracted = extractArgsFromToolItem(item);
        if (extracted === null) continue;

        callParts.push({
          functionCall: { name: extracted.toolName, args: extracted.args },
        });

        let result: string;
        if (item.status === 'Canceled') {
          result = 'Tool call was cancelled by the user.';
        } else if (item.status === 'Error') {
          result = extractResultFromToolItem(item) || 'Tool call failed with an error.';
        } else {
          result = extractResultFromToolItem(item) || 'Success';
        }

        responseParts.push({
          functionResponse: {
            name: extracted.toolName,
            response: { result },
          },
        });
      }

      // Strict: call and response count must match
      if (callParts.length !== responseParts.length || callParts.length === 0) continue;

      contents.push({ role: 'model', parts: callParts });
      contents.push({ role: 'user', parts: responseParts });
    }
    // Skip tips, agent_status, and all other message types
  }

  // Merge adjacent same-role entries to satisfy Gemini's alternating role requirement
  return mergeAdjacentSameRole(contents);
}

/**
 * Merge adjacent Content entries with the same role.
 * Gemini API requires strictly alternating user/model roles.
 */
function mergeAdjacentSameRole(contents: GeminiContent[]): GeminiContent[] {
  if (contents.length === 0) return [];

  const merged: GeminiContent[] = [contents[0]];
  for (let i = 1; i < contents.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = contents[i];
    if (prev.role === curr.role) {
      // Merge parts into previous entry
      prev.parts = [...prev.parts, ...curr.parts];
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
