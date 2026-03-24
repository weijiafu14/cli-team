import { describe, expect, it } from 'vitest';
import type { IMessageText, IMessageToolGroup } from '../../src/common/chatLib';
import {
  buildGeminiHistoryFromDb,
  filterMessagesForGeminiHistory,
} from '../../src/process/task/buildGeminiHistoryFromDb';

const createTextMessage = (id: string, position: 'left' | 'right', content: string, msgId?: string): IMessageText => ({
  id,
  msg_id: msgId,
  type: 'text',
  conversation_id: 'gemini-conversation',
  position,
  content: { content },
  createdAt: Date.now(),
});

const createToolGroup = (): IMessageToolGroup => ({
  id: 'tool-1',
  type: 'tool_group',
  conversation_id: 'gemini-conversation',
  position: 'left',
  content: [
    {
      callId: 'call-1',
      description: 'read file',
      name: 'ReadFile',
      renderOutputAsMarkdown: false,
      status: 'Success',
      confirmationDetails: {
        type: 'info',
        title: 'Read file',
        prompt: 'read README',
      },
      resultDisplay: 'README content',
    },
  ],
  createdAt: Date.now(),
});

describe('buildGeminiHistoryFromDb', () => {
  it('filters out the in-flight user message so the current turn does not enter history twice', () => {
    const messages = [
      createTextMessage('m-1', 'left', 'assistant says hello'),
      createTextMessage('m-2', 'right', 'current user message', 'msg-current'),
    ];

    const filtered = filterMessagesForGeminiHistory(messages, 'msg-current');

    expect(filtered.map((message) => message.id)).toEqual(['m-1']);
  });

  it('reconstructs alternating Gemini history from text and completed tool groups', () => {
    const history = buildGeminiHistoryFromDb([
      createTextMessage('u-1', 'right', 'user question'),
      createTextMessage('m-1', 'left', 'assistant answer'),
      createToolGroup(),
    ]);

    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({
      role: 'user',
      parts: [{ text: 'user question' }],
    });
    expect(history[1]).toEqual({
      role: 'model',
      parts: [{ text: 'assistant answer' }, { functionCall: { name: 'read_file', args: { prompt: 'read README' } } }],
    });
    expect(history[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'read_file', response: { result: 'README content' } } }],
    });
  });
});
