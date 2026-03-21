/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input, Button } from '@arco-design/web-react';
import { Send } from '@icon-park/react';
import { agentTeam, type ICoordTimelineEntry } from '@/common/ipcBridge';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MarkdownView from '@/renderer/components/Markdown';
import { useNavigate } from 'react-router-dom';
import styles from './AgentTeamChat.module.css';

const { TextArea } = Input;

type AgentTeamChatProps = {
  conversation_id: string;
  workspace?: string;
};

function mergeTimelineEntries(
  prev: ICoordTimelineEntry[],
  incoming: ICoordTimelineEntry | ICoordTimelineEntry[],
): ICoordTimelineEntry[] {
  const next = Array.isArray(incoming) ? incoming : [incoming];
  if (next.length === 0) {
    return prev;
  }

  const byId = new Map<string, ICoordTimelineEntry>();
  for (const entry of prev) {
    byId.set(entry.id, entry);
  }
  for (const entry of next) {
    byId.set(entry.id, entry);
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.ts === b.ts) {
      return a.id.localeCompare(b.id);
    }
    return a.ts.localeCompare(b.ts);
  });
}

export default function AgentTeamChat({ conversation_id, workspace }: AgentTeamChatProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'agents'>('timeline');
  const [timeline, setTimeline] = useState<ICoordTimelineEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);

  // Load initial timeline
  useEffect(() => {
    shouldAutoScrollRef.current = false;
    agentTeam.getTimeline.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        setTimeline((prev) => mergeTimelineEntries(prev, result.data.entries));
      }
    });
  }, [conversation_id]);

  // Listen for timeline stream updates
  useEffect(() => {
    const cleanup = agentTeam.timelineStream.on((event) => {
      if (event.conversation_id === conversation_id) {
        shouldAutoScrollRef.current = true;
        setTimeline((prev) => mergeTimelineEntries(prev, event.entry));
      }
    });
    return cleanup;
  }, [conversation_id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!shouldAutoScrollRef.current || !timelineRef.current) {
      return;
    }

    timelineRef.current.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: 'smooth',
    });
    shouldAutoScrollRef.current = false;
  }, [timeline]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setSending(true);
    setInputValue('');

    try {
      const result = await agentTeam.sendMessage.invoke({
        conversation_id,
        input: text,
      });
      // Optimistic: merge returned entry in case stream event hasn't arrived yet
      if (result.success && result.data?.entry) {
        setTimeline((prev) => mergeTimelineEntries(prev, result.data!.entry));
      }
    } catch (err) {
      console.error('[AgentTeamChat] Send failed:', err);
    } finally {
      setSending(false);
    }
  }, [conversation_id, inputValue, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'agent-team' }}>
      <div className={styles.container}>
        {/* Simple tab bar — no Arco Tabs, avoids absolute-positioning layout conflicts */}
        <div className={styles.tabBar}>
          <button
            type='button'
            className={`${styles.tab} ${activeTab === 'timeline' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
          <button
            type='button'
            className={`${styles.tab} ${activeTab === 'agents' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('agents')}
          >
            Agents
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'timeline' ? (
          <div ref={timelineRef} className={styles.timeline}>
            {timeline.length === 0 ? (
              <div className={styles.empty}>No coordination messages yet. Send a message to start the team.</div>
            ) : (
              timeline.map((entry) => (
                <div key={entry.id} className={styles.entry}>
                  <div className={styles.entryHeader}>
                    <span className={styles.entryFrom}>{entry.from}</span>
                    <span className={styles.entryType}>{entry.type}</span>
                    <span className={styles.entryTime}>{new Date(entry.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className={styles.entrySummary}>{entry.summary}</div>
                  {entry.body && (
                    <div className={styles.entryBody}>
                      <MarkdownView>{entry.body}</MarkdownView>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <AgentsMembersView conversation_id={conversation_id} />
        )}

        <div className={styles.inputArea}>
          <TextArea
            value={inputValue}
            onChange={setInputValue}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to the team... (Enter to send, Shift+Enter for newline)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={sending}
          />
          <Button type="primary" icon={<Send />} onClick={handleSend} loading={sending} disabled={!inputValue.trim()} />
        </div>
      </div>
    </ConversationProvider>
  );
}

function AgentsMembersView({ conversation_id }: { conversation_id: string }) {
  const [members, setMembers] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    agentTeam.getMembers.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        setMembers(
          result.data.conversations.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
          })),
        );
      }
    });
  }, [conversation_id]);

  return (
    <div className={styles.members}>
      {members.length === 0 ? (
        <div className={styles.empty}>No team members found.</div>
      ) : (
        members.map((member) => (
          <div
            key={member.id}
            className={styles.memberCard}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              navigate(`/conversation/${member.id}`);
            }}
          >
            <div className={styles.memberName}>{member.name}</div>
            <div className={styles.memberType}>{member.type}</div>
          </div>
        ))
      )}
    </div>
  );
}
