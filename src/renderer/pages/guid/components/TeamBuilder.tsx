/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import { Peoples, Add } from '@icon-park/react';
import { agentTeam } from '@/common/ipcBridge';
import type { TChatConversation } from '@/common/storage';
import type { AcpBackendAll } from '@/types/acpTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AvailableAgent } from '../types';

const { TextArea } = Input;

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

const TeamBuilder: React.FC<TeamBuilderProps> = ({ availableAgents, onTeamCreated, initialWorkspace }) => {
  const [teamName, setTeamName] = useState('');
  const [workspace, setWorkspace] = useState(initialWorkspace || '');
  const [initialMessage, setInitialMessage] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<MemberSelection[]>([]);
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

  const handleToggleMember = useCallback(
    (option: (typeof memberOptions)[0], checked: boolean) => {
      if (checked) {
        setSelectedMembers((prev) => [
          ...prev,
          { key: option.key, name: option.label, type: option.type, backend: option.backend },
        ]);
      } else {
        setSelectedMembers((prev) => prev.filter((m) => m.key !== option.key));
      }
    },
    [],
  );

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
    <div className='w-full max-w-560px mx-auto p-24px rd-12px bg-2 b-1 b-solid b-border'>
      <div className='flex items-center gap-8px mb-20px'>
        <Peoples theme='outline' size={24} fill='var(--color-text-1)' />
        <span className='text-18px font-semibold text-t-primary'>Create Agent Team</span>
      </div>

      <div className='flex flex-col gap-16px'>
        <div>
          <label className='text-13px text-t-secondary mb-4px block'>Team Name</label>
          <Input value={teamName} onChange={setTeamName} placeholder='My Agent Team' />
        </div>

        <div>
          <label className='text-13px text-t-secondary mb-4px block'>Workspace (optional)</label>
          <Input value={workspace} onChange={setWorkspace} placeholder='Leave empty for auto-generated workspace' />
        </div>

        <div>
          <label className='text-13px text-t-secondary mb-8px block'>Team Members (select at least 2)</label>
          <div className='flex flex-col gap-4px'>
            {memberOptions.map((option) => {
              const logoSrc = getAgentLogo(option.backend);
              const isSelected = selectedMembers.some((m) => m.key === option.key);
              return (
                <div
                  key={option.key}
                  className={`flex items-center gap-12px p-12px rd-8px cursor-pointer b-1 b-solid transition-all ${
                    isSelected
                      ? 'bg-primary-1 b-primary-light-3'
                      : 'bg-2 b-border hover:b-primary-light-4'
                  }`}
                  onClick={() => handleToggleMember(option, !isSelected)}
                >
                  {logoSrc ? (
                    <img src={logoSrc} alt='' width={24} height={24} className='rd-4px object-contain shrink-0' />
                  ) : (
                    <div className='w-24px h-24px rd-4px bg-fill-2 flex items-center justify-center text-12px text-t-secondary shrink-0'>
                      {option.label.slice(0, 1)}
                    </div>
                  )}
                  <div className='flex-1 min-w-0'>
                    <div className='text-14px font-medium text-t-primary'>{option.label}</div>
                    <div className='text-12px text-t-tertiary'>{option.type}</div>
                  </div>
                  <div className={`w-16px h-16px rd-full b-1 b-solid flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-primary-6 b-primary-6' : 'b-border'
                  }`}>
                    {isSelected && <span className='text-white text-10px'>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className='text-13px text-t-secondary mb-4px block'>Initial Message (optional)</label>
          <TextArea
            value={initialMessage}
            onChange={setInitialMessage}
            placeholder='Send an initial task to the team...'
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>

        <Button
          type='primary'
          long
          loading={creating}
          disabled={selectedMembers.length < 2}
          onClick={handleCreate}
          icon={<Add />}
        >
          Create Team ({selectedMembers.length} members)
        </Button>
      </div>
    </div>
  );
};

export default TeamBuilder;
