/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { agentTeam, conversation as ipcConversation, fs as ipcFs, type ICoordTimelineEntry } from '@/common/ipcBridge';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import SendBox from '@/renderer/components/chat/sendbox';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import MarkdownView from '@/renderer/components/Markdown';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { IAgentTeamMember } from '@/common/storage';
import type { FileMetadata } from '@/renderer/services/FileService';
import { useNavigate } from 'react-router-dom';
import { PauseOne, SettingConfig } from '@icon-park/react';
import { Image } from '@arco-design/web-react';
import MentionDropdown from '@/renderer/pages/guid/components/MentionDropdown';
import type { MentionOption } from '@/renderer/pages/guid/types';
import styles from './AgentTeamChat.module.css';

type AgentTeamChatProps = {
  conversation_id: string;
  workspace?: string;
};

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getPathTailLabel(nextPath?: string): string {
  if (!nextPath) {
    return 'Auto workspace';
  }
  const parts = nextPath.split(/[\\/]/);
  return parts[parts.length - 1] || nextPath;
}

function getTypeBadgeStyle(type: string) {
  switch (type.toLowerCase()) {
    case 'consensus':
    case 'decision':
      return { background: 'var(--color-danger-light-1)', color: 'var(--color-danger-6)' };
    case 'finding':
    case 'challenge':
      return { background: 'var(--color-warning-light-1)', color: 'var(--color-warning-6)' };
    case 'claim':
    case 'done':
      return { background: 'var(--color-success-light-1)', color: 'var(--color-success-6)' };
    case 'ack':
    case 'update':
    default:
      return { background: 'var(--color-fill-2)', color: 'var(--color-text-3)' };
  }
}

const CollapsibleBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (!contentRef.current) return;
    
    // Check initially
    setIsOverflowing(contentRef.current.scrollHeight > 300);
    
    // Observe the inner content which can grow freely, so ResizeObserver reliably fires
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsOverflowing(entry.target.scrollHeight > 300);
      }
    });
    
    observer.observe(contentRef.current);
    
    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className='relative'>
      <div 
        ref={wrapperRef}
        style={{ 
          maxHeight: expanded ? 'none' : '300px', 
          overflow: 'hidden',
          transition: 'max-height 0.3s ease'
        }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
      {!expanded && isOverflowing && (
        <div 
          className='absolute bottom-0 left-0 right-0 h-80px flex items-end justify-center pb-8px'
          style={{ background: 'linear-gradient(to bottom, transparent, var(--color-bg-2) 80%)' }}
        >
          <button 
            type='button'
            className='px-12px py-4px rd-16px text-12px bg-fill-2 hover:bg-fill-3 text-t-2 border-none cursor-pointer transition-colors shadow-sm'
            onClick={() => setExpanded(true)}
          >
            Show more
          </button>
        </div>
      )}
      {expanded && isOverflowing && (
        <div className='flex justify-center mt-8px'>
          <button 
            type='button'
            className='px-12px py-4px rd-16px text-12px bg-fill-2 hover:bg-fill-3 text-t-2 border-none cursor-pointer transition-colors'
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        </div>
      )}
    </div>
  );
}

function mergeTimelineEntries(
  prev: ICoordTimelineEntry[],
  incoming: ICoordTimelineEntry | ICoordTimelineEntry[]
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

  const sorted = Array.from(byId.values());
  sorted.sort((a: ICoordTimelineEntry, b: ICoordTimelineEntry) => {
    const timeA = new Date(a.ts).getTime();
    const timeB = new Date(b.ts).getTime();
    if (timeA === timeB) {
      return a.id.localeCompare(b.id);
    }
    return timeA - timeB;
  });
  return sorted;
}

function MarkdownAttachment({ path: filePath, onReady }: { path: string; onReady?: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    ipcFs.readFile
      .invoke({ path: filePath })
      .then((next) => {
        if (!mounted) {
          return;
        }
        setContent(next);
        onReady?.();
      })
      .catch(() => {
        if (mounted) {
          setContent(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, [filePath, onReady]);
  if (content === null) return null;
  return (
    <div className={styles.entryBody}>
      <CollapsibleBody>
        <MarkdownView>{content}</MarkdownView>
      </CollapsibleBody>
    </div>
  );
}

function ImageAttachment({ path: filePath, onReady }: { path: string; onReady?: () => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ipcFs.getImageBase64
      .invoke({ path: filePath })
      .then((next) => {
        if (!mounted) {
          return;
        }
        setImageSrc(next);
        onReady?.();
      })
      .catch(() => {
        if (mounted) {
          setImageSrc(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, [filePath, onReady]);

  if (!imageSrc) {
    return null;
  }

  return (
    <div className={styles.entryImageCard}>
      <Image src={imageSrc} alt={getFileName(filePath)} className={styles.entryImage} preview />
      <div className={styles.entryImageName}>{getFileName(filePath)}</div>
    </div>
  );
}

export default function AgentTeamChat({ conversation_id, workspace }: AgentTeamChatProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'agents'>('timeline');
  const [timeline, setTimeline] = useState<ICoordTimelineEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);
  const [memberMap, setMemberMap] = useState<Map<string, { name: string; backend?: string; type: string }>>(new Map());
  const [memberList, setMemberList] = useState<IAgentTeamMember[]>([]);
  const [pendingFiles, setPendingFiles] = useState<FileMetadata[]>([]);
  const [aborting, setAborting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const scrollBehaviorRef = useRef<'smooth' | 'auto'>('auto');
  const keepPinnedToBottomRef = useRef(false);
  const keepPinnedTimerRef = useRef<number | null>(null);

  const requestTimelineScroll = useCallback((behavior: 'smooth' | 'auto') => {
    scrollBehaviorRef.current = behavior;
    shouldAutoScrollRef.current = true;
    keepPinnedToBottomRef.current = true;
    if (keepPinnedTimerRef.current !== null) {
      window.clearTimeout(keepPinnedTimerRef.current);
    }
    keepPinnedTimerRef.current = window.setTimeout(() => {
      keepPinnedToBottomRef.current = false;
      keepPinnedTimerRef.current = null;
    }, 900);
  }, []);

  const handleRichContentReady = useCallback(() => {
    if (!keepPinnedToBottomRef.current || !timelineRef.current || activeTab !== 'timeline') {
      return;
    }
    timelineRef.current.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [activeTab]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null || memberList.length === 0) return [];
    const q = mentionQuery.toLowerCase();
    return memberList.filter((m) => m.name.toLowerCase().includes(q));
  }, [mentionQuery, memberList]);

  const handleInputChange = useCallback((val: string) => {
    setInputValue(val);
    const atIndex = val.lastIndexOf('@');
    if (atIndex >= 0) {
      const afterAt = val.slice(atIndex + 1);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionQuery(afterAt);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  const insertMention = useCallback((memberName: string) => {
    setInputValue((prev) => {
      const atIndex = prev.lastIndexOf('@');
      if (atIndex < 0) return prev;
      return `${prev.slice(0, atIndex)}@${memberName} `;
    });
    setMentionQuery(null);
  }, []);

  const handleAbort = useCallback(async () => {
    setAborting(true);
    try {
      await agentTeam.abort.invoke({ conversation_id });
    } catch (err) {
      console.error('[AgentTeamChat] Abort failed:', err);
    } finally {
      setAborting(false);
    }
  }, [conversation_id]);

  const handleFilesAdded = useCallback((files: FileMetadata[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const { openFileSelector } = useOpenFileSelector({
    onFilesSelected: (paths) => {
      const files: FileMetadata[] = paths.map((p) => ({
        path: p,
        name: p.split('/').pop() || p,
        size: 0,
        type: '',
        lastModified: Date.now(),
      }));
      handleFilesAdded(files);
    },
  });
  const workspaceLabel = getPathTailLabel(workspace);
  const timelineCount = timeline.length;
  const mentionableCount = memberList.length;
  const latestEntry = timeline[timeline.length - 1];
  const latestActor = latestEntry
    ? latestEntry.role === 'user'
      ? 'You'
      : memberMap.get(latestEntry.from)?.name || latestEntry.from
    : null;

  // Load team members for avatar mapping and @mention list
  useEffect(() => {
    ipcConversation.get.invoke({ id: conversation_id }).then((teamConv) => {
      if (!teamConv || teamConv.type !== 'agent-team') return;
      const members = (teamConv.extra as { members?: IAgentTeamMember[] }).members || [];
      const map = new Map<string, { name: string; backend?: string; type: string }>();
      for (const m of members) {
        const info = { name: m.name, backend: m.backend || m.type, type: m.type };
        map.set(m.memberId, info);
        map.set(m.conversationId, info);
        map.set(m.name, info);
      }
      setMemberMap(map);
      setMemberList(members);
    });
  }, [conversation_id]);

  // Load initial timeline
  useEffect(() => {
    agentTeam.getTimeline.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        if (result.data.entries.length > 0) {
          requestTimelineScroll('auto');
        }
        setTimeline((prev) => mergeTimelineEntries(prev, result.data.entries));
      }
    });
  }, [conversation_id, requestTimelineScroll]);

  // Listen for timeline stream updates
  useEffect(() => {
    const cleanup = agentTeam.timelineStream.on((event) => {
      if (event.conversation_id === conversation_id) {
        requestTimelineScroll('smooth');
        setTimeline((prev) => mergeTimelineEntries(prev, event.entry));
      }
    });
    return cleanup;
  }, [conversation_id, requestTimelineScroll]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!shouldAutoScrollRef.current || !timelineRef.current) {
      return;
    }
    timelineRef.current.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: scrollBehaviorRef.current,
    });
    shouldAutoScrollRef.current = false;
  }, [timeline]);

  useEffect(() => {
    return () => {
      if (keepPinnedTimerRef.current !== null) {
        window.clearTimeout(keepPinnedTimerRef.current);
      }
    };
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text && pendingFiles.length === 0) return;

      // Parse @mentions: sort by name length descending so "Claude Code" matches before "Claude"
      const mentionedIds: string[] = [];
      if (memberList.length > 0) {
        const sorted = [...memberList];
        sorted.sort((a: IAgentTeamMember, b: IAgentTeamMember) => b.name.length - a.name.length);
        let remaining = text;
        for (const m of sorted) {
          const token = `@${m.name}`;
          const idx = remaining.indexOf(token);
          if (idx >= 0) {
            const afterToken = remaining[idx + token.length];
            if (afterToken === undefined || !/[a-zA-Z0-9]/.test(afterToken)) {
              mentionedIds.push(m.memberId);
              remaining = remaining.slice(0, idx) + remaining.slice(idx + token.length);
            }
          }
        }
      }

      setSending(true);
      try {
        const filePaths = pendingFiles.length > 0 ? pendingFiles.map((f) => f.path) : undefined;
        const result = await agentTeam.sendMessage.invoke({
          conversation_id,
          input: text,
          files: filePaths,
          targets: mentionedIds.length > 0 ? mentionedIds : undefined,
        });
        if (result.success && result.data?.entry) {
          setTimeline((prev) => mergeTimelineEntries(prev, result.data!.entry));
        }
        setPendingFiles([]);
      } catch (err) {
        console.error('[AgentTeamChat] Send failed:', err);
      } finally {
        setSending(false);
      }
    },
    [conversation_id, pendingFiles, memberList]
  );

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'agent-team' }}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle} style={{ fontSize: '13px', display: 'flex', alignItems: 'center' }}>
              <span className='font-medium'>Agent Team</span> 
              <span className='text-12px text-t-3 font-normal ml-8px px-6px py-2px bg-fill-2 rd-4px'>{workspaceLabel}</span>
            </div>
            
            <div className={styles.tabBar} style={{ padding: 0, border: 'none', marginLeft: '12px' }}>
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
                Team Roster
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'timeline' ? (
          <div ref={timelineRef} className={styles.timeline}>
            {timeline.length === 0 ? (
              <div className={styles.empty}>No coordination messages yet. Send a message to start the team.</div>
            ) : (
              timeline.map((entry) => {
                const memberInfo = memberMap.get(entry.from);
                const logoBackend = entry.role === 'user' ? null : memberInfo?.backend || entry.from;
                const logoSrc = logoBackend ? getAgentLogo(logoBackend) : null;
                const displayName = entry.role === 'user' ? 'You' : memberInfo?.name || entry.from;
                const dispatchLabel =
                  entry.dispatch === 'targets' && entry.to
                    ? `→ ${entry.to.map((t) => memberMap.get(t)?.name || t).join(', ')}`
                    : entry.dispatch === 'none'
                      ? '(no wakeup)'
                      : null;
                const imagePaths = entry.images || [];
                const markdownFiles = (entry.files || []).filter(isMarkdownFile);
                const otherFiles = (entry.files || []).filter((f) => !isMarkdownFile(f));

                return (
                  <div
                    key={entry.id}
                    className={`${styles.entry} ${entry.role === 'user' ? styles.entryUser : styles.entryAgent}`}
                  >
                    <div className={styles.entryHeader}>
                      {logoSrc ? (
                        <img src={logoSrc} alt='' className={styles.entryLogo} />
                      ) : (
                        <div className={styles.entryUserIcon}>
                          {entry.role === 'user' ? 'U' : <SettingConfig />}
                        </div>
                      )}
                      <span className={styles.entryFrom}>{displayName}</span>
                      <span className={styles.entryType} style={getTypeBadgeStyle(entry.type)}>{entry.type}</span>
                      {dispatchLabel && <span className={styles.entryDispatch}>{dispatchLabel}</span>}
                      <span className={styles.entryTime}>{new Date(entry.ts).toLocaleTimeString()}</span>
                    </div>
                    <div className={styles.entrySummary}>
                      {entry.summary.split(/\\n|\n/).map((line, idx, arr) => (
                        <React.Fragment key={idx}>
                          {line}
                          {idx < arr.length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </div>
                    {(entry as any).attachment?.path ? (
                      <MarkdownAttachment key={(entry as any).attachment.path} path={(entry as any).attachment.path} onReady={handleRichContentReady} />
                    ) : entry.body ? (
                      <div className={styles.entryBody}>
                        <CollapsibleBody>
                          <MarkdownView>{entry.body}</MarkdownView>
                        </CollapsibleBody>
                      </div>
                    ) : null}
                    {imagePaths.length > 0 && (
                      <div className={styles.entryImages}>
                        {imagePaths.map((imagePath) => (
                          <ImageAttachment key={imagePath} path={imagePath} onReady={handleRichContentReady} />
                        ))}
                      </div>
                    )}
                    {markdownFiles.length > 0 && (
                      <>
                        {markdownFiles.map((filePath) => (
                          <MarkdownAttachment key={filePath} path={filePath} onReady={handleRichContentReady} />
                        ))}
                        {otherFiles.length > 0 && (
                          <div className={styles.entryFiles}>
                            <HorizontalFileList>
                              {otherFiles.map((filePath, i) => (
                                <FilePreview key={`${filePath}-${i}`} path={filePath} onRemove={() => {}} readonly />
                              ))}
                            </HorizontalFileList>
                          </div>
                        )}
                      </>
                    )}
                    {markdownFiles.length === 0 && otherFiles.length > 0 && (
                      <div className={styles.entryFiles}>
                        <HorizontalFileList>
                          {otherFiles.map((filePath, i) => (
                            <FilePreview key={`${filePath}-${i}`} path={filePath} onRemove={() => {}} readonly />
                          ))}
                        </HorizontalFileList>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <AgentsMembersView conversation_id={conversation_id} />
        )}

        <div className={styles.inputArea}>
          {mentionSuggestions.length > 0 && mentionQuery !== null && (
            <div className='absolute bottom-100% mb-8px left-20px z-10 w-240px'>
              <MentionDropdown
                menuRef={{ current: null } as any}
                options={mentionSuggestions.map((m) => ({
                  key: m.name,
                  label: m.name,
                  type: m.type,
                  logo: getAgentLogo(m.backend || m.type) || undefined,
                }))}
                selectedKey={mentionSuggestions[mentionIndex]?.name || ''}
                onSelect={(key) => insertMention(key)}
              />
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className={styles.pendingFiles}>
              <HorizontalFileList>
                {pendingFiles.map((f, i) => (
                  <FilePreview
                    key={`${f.path}-${i}`}
                    path={f.path}
                    onRemove={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </HorizontalFileList>
            </div>
          )}
          <SendBox
            value={inputValue}
            onChange={handleInputChange}
            onSend={handleSend}
            loading={sending}
            disabled={sending}
            placeholder='输入 @ 指定分配工作，或直接发送消息给全队...'
            defaultMultiLine
            onFilesAdded={handleFilesAdded}
            tools={
              <>
                <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
                <button
                  type='button'
                  className={styles.abortButton}
                  onClick={handleAbort}
                  disabled={aborting}
                  title='Abort all agents'
                >
                  <PauseOne theme='filled' size='14' fill='currentColor' />
                </button>
              </>
            }
          />
        </div>
      </div>
    </ConversationProvider>
  );
}

function AgentsMembersView({ conversation_id }: { conversation_id: string }) {
  const [members, setMembers] = useState<Array<{ id: string; name: string; type: string; backend?: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    agentTeam.getMembers.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        setMembers(
          result.data.conversations.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            backend: (c.extra as { backend?: string })?.backend,
          }))
        );
      }
    });
  }, [conversation_id]);

  return (
    <div className={styles.members}>
      {members.length === 0 ? (
        <div className={styles.empty}>No team members found.</div>
      ) : (
        members.map((member) => {
          const logoSrc = getAgentLogo(member.backend || member.type);
          return (
            <div
              key={member.id}
              className={styles.memberCard}
              onClick={() => {
                navigate(`/conversation/${member.id}`);
              }}
            >
              {logoSrc && <img src={logoSrc} alt='' className={styles.memberLogo} />}
              <div>
                <div className={styles.memberName}>{member.name}</div>
                <div className={styles.memberType}>{member.backend || member.type}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
