/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import { Peoples, Add, FolderOpen } from '@icon-park/react';
import { agentTeam, dialog } from '@/common/ipcBridge';
import type { TChatConversation } from '@/common/storage';
import type { AcpBackendAll } from '@/types/acpTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import SendBox from '@/renderer/components/chat/sendbox';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import type { FileMetadata } from '@/renderer/services/FileService';
import type { AvailableAgent } from '../types';

type TeamBuilderProps = {
  availableAgents: AvailableAgent[];
  onTeamCreated: (conversation: Extract<TChatConversation, { type: 'agent-team' }>) => void;
  initialWorkspace?: string;
};

type MemberSelection = {
  key: string;
  name: string;
  type: 'acp' | 'gemini';
  backend?: AcpBackendAll;
};

function getWorkspaceLabel(workspace: string): string {
  if (!workspace) {
    return 'Auto workspace';
  }
  const segments = workspace.split(/[\\/]/);
  return segments[segments.length - 1] || workspace;
}

const TeamBuilder: React.FC<TeamBuilderProps> = ({ availableAgents, onTeamCreated, initialWorkspace }) => {
  const [teamName, setTeamName] = useState('');
  const [workspace, setWorkspace] = useState(initialWorkspace || '');
  const [initialMessage, setInitialMessage] = useState('');
  const [initialFiles, setInitialFiles] = useState<FileMetadata[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<MemberSelection[]>([]);
  const selectedCount = selectedMembers.length;
  const workspaceLabel = getWorkspaceLabel(workspace);

  const handleFilesAdded = useCallback((files: FileMetadata[]) => {
    setInitialFiles((prev) => [...prev, ...files]);
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
  const [creating, setCreating] = useState(false);

  // Build member options from available agents
  const memberOptions = (availableAgents || [])
    .filter((agent) => agent.backend !== 'custom' || agent.isExtension)
    .map((agent) => ({
      key: agent.backend,
      label: agent.name,
      type: (agent.backend === 'gemini' ? 'gemini' : 'acp') as 'acp' | 'gemini',
      backend: agent.backend,
    }));

  const handleToggleMember = useCallback((option: (typeof memberOptions)[0], checked: boolean) => {
    if (checked) {
      setSelectedMembers((prev) => [
        ...prev,
        { key: option.key, name: option.label, type: option.type, backend: option.backend },
      ]);
    } else {
      setSelectedMembers((prev) => prev.filter((m) => m.key !== option.key));
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedMembers.length < 2) {
      Message.warning('Please select at least 2 team members');
      return;
    }

    setCreating(true);
    try {
      const result = await agentTeam.create.invoke({
        name: teamName || 'Agent Team',
        workspace: workspace || undefined,
        customWorkspace: Boolean(workspace),
        members: selectedMembers.map((m) => ({
          type: m.type,
          name: m.name,
          backend: m.backend as AcpBackendAll | undefined,
        })),
        initialMessage: initialMessage || undefined,
        initialFiles: initialFiles.length > 0 ? initialFiles.map((f) => f.path) : undefined,
        dispatchPolicy: 'queue',
        defaultView: 'timeline',
      });

      if (result.success && result.data) {
        Message.success('Agent Team created');
        onTeamCreated(result.data.teamConversation);
      } else {
        Message.error(result.msg || 'Failed to create team');
      }
    } catch (err) {
      Message.error('Failed to create team');
      console.error('[TeamBuilder] Create failed:', err);
    } finally {
      setCreating(false);
    }
  }, [teamName, workspace, initialMessage, selectedMembers, onTeamCreated]);

  return (
    <div className='w-full max-w-1080px mx-auto p-20px'>
      <div className='rd-12px p-24px bg-[var(--color-bg-2)] b-1 b-solid b-[var(--color-border)] shadow-sm'>
        <div className='flex items-center gap-12px mb-24px'>
          <div className='w-40px h-40px rd-8px bg-primary-6 flex items-center justify-center text-white'>
            <Peoples theme='outline' size={24} fill='currentColor' />
          </div>
          <div>
            <div className='text-20px font-600 text-t-primary'>Agent Team Studio</div>
            <div className='text-13px text-t-secondary mt-2px'>
              Build a specialized group of agents to collaborate on tasks in a shared workspace.
            </div>
          </div>
        </div>

        <div className='grid gap-20px lg:grid-cols-[1.2fr_1fr]'>
          <div className='flex flex-col gap-20px'>
            <div className='rd-8px p-20px bg-[var(--color-bg-1)] b-1 b-solid b-[var(--color-border)]'>
              <div className='text-14px font-600 text-t-primary mb-16px'>Workspace Identity</div>
              <div className='flex flex-col gap-16px'>
                <div>
                  <label className='text-12px font-500 text-t-secondary mb-6px block'>Team Name</label>
                  <Input value={teamName} onChange={setTeamName} placeholder='e.g. Frontend Refactor Team' />
                </div>
                <div>
                  <label className='text-12px font-500 text-t-secondary mb-6px block'>Working Directory</label>
                  <div className='flex gap-8px'>
                    <Input
                      className='flex-1'
                      value={workspace}
                      onChange={setWorkspace}
                      placeholder='Leave empty for an auto-generated workspace'
                    />
                    <Button
                      icon={<FolderOpen size={16} />}
                      onClick={() => {
                        dialog.showOpen.invoke({ properties: ['openDirectory'] }).then((dirs) => {
                          if (dirs && dirs[0]) setWorkspace(dirs[0]);
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className='rd-8px p-20px bg-[var(--color-bg-1)] b-1 b-solid b-[var(--color-border)]'>
              <div className='text-14px font-600 text-t-primary mb-16px'>Opening Brief</div>
              <div className='text-12px text-t-secondary mb-12px'>
                Provide initial instructions and context files to kick off the coordination stream.
              </div>
              {initialFiles.length > 0 && (
                <div className='mb-12px'>
                  <HorizontalFileList>
                    {initialFiles.map((f, i) => (
                      <FilePreview
                        key={`${f.path}-${i}`}
                        path={f.path}
                        onRemove={() => setInitialFiles((prev) => prev.filter((_, j) => j !== i))}
                      />
                    ))}
                  </HorizontalFileList>
                </div>
              )}
              <SendBox
                value={initialMessage}
                onChange={setInitialMessage}
                onSend={async () => {
                  await handleCreate();
                }}
                placeholder='Describe the goal for the team...'
                defaultMultiLine
                lockMultiLine
                onFilesAdded={handleFilesAdded}
                tools={<FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />}
              />
            </div>
          </div>

          <div className='flex flex-col gap-20px'>
            <div className='flex-1 rd-8px p-20px bg-[var(--color-bg-1)] b-1 b-solid b-[var(--color-border)]'>
              <div className='flex items-center justify-between mb-16px'>
                <div className='text-14px font-600 text-t-primary'>Team Roster</div>
                <div className='text-12px font-500 text-primary-6 bg-primary-1 px-8px py-2px rd-4px'>
                  {selectedCount} selected
                </div>
              </div>

              <div className='text-12px text-t-secondary mb-16px'>
                Select at least two specialists to join the room.
              </div>

              <div className='grid gap-12px sm:grid-cols-2'>
                {memberOptions.map((option) => {
                  const logoSrc = getAgentLogo(option.backend);
                  const isSelected = selectedMembers.some((m) => m.key === option.key);
                  return (
                    <div
                      key={option.key}
                      className={`flex items-center gap-10px p-12px rd-8px cursor-pointer b-1 b-solid transition-colors ${
                        isSelected
                          ? 'bg-primary-1 b-primary-5'
                          : 'bg-[var(--color-fill-2)] b-transparent hover:bg-[var(--color-fill-3)]'
                      }`}
                      onClick={() => handleToggleMember(option, !isSelected)}
                    >
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt=''
                          width={24}
                          height={24}
                          className='rd-4px object-contain shrink-0 bg-[var(--color-bg-1)]'
                        />
                      ) : (
                        <div className='w-24px h-24px rd-4px bg-[var(--color-bg-1)] flex items-center justify-center text-12px font-600 text-t-secondary shrink-0'>
                          {option.label.slice(0, 1)}
                        </div>
                      )}
                      <div className='flex-1 min-w-0'>
                        <div className='text-13px font-500 text-t-primary truncate'>{option.label}</div>
                        <div className='text-11px text-t-tertiary uppercase tracking-wider'>{option.type}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className='rd-8px p-20px bg-[var(--color-fill-1)] b-1 b-solid b-[var(--color-border)]'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='text-14px font-600 text-t-primary'>Launch Room</div>
                  <div className='text-12px text-t-secondary mt-4px'>
                    {selectedCount < 2 ? 'Select more agents to start' : 'Ready to begin coordination'}
                  </div>
                </div>
                <Button
                  type='primary'
                  loading={creating}
                  disabled={selectedMembers.length < 2}
                  onClick={handleCreate}
                  icon={<Add />}
                >
                  Create Team
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamBuilder;
