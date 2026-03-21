/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Select, Checkbox, Message } from '@arco-design/web-react';
import { Peoples, Add } from '@icon-park/react';
import { agentTeam } from '@/common/ipcBridge';
import type { TChatConversation } from '@/common/storage';
import type { AcpBackendAll } from '@/types/acpTypes';
import type { AvailableAgent } from '../types';

const { TextArea } = Input;

type TeamBuilderProps = {
  availableAgents: AvailableAgent[];
  onTeamCreated: (conversation: Extract<TChatConversation, { type: 'agent-team' }>) => void;
};

type MemberSelection = {
  key: string;
  name: string;
  type: 'acp' | 'gemini';
  backend?: AcpBackendAll;
};

const TeamBuilder: React.FC<TeamBuilderProps> = ({ availableAgents, onTeamCreated }) => {
  const [teamName, setTeamName] = useState('');
  const [workspace, setWorkspace] = useState('');
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
    <div
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: 24,
        borderRadius: 12,
        background: 'var(--color-bg-2)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Peoples theme='outline' size={24} fill='var(--color-text-1)' />
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-1)' }}>Create Agent Team</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 4, display: 'block' }}>
            Team Name
          </label>
          <Input value={teamName} onChange={setTeamName} placeholder='My Agent Team' />
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 4, display: 'block' }}>
            Workspace (optional)
          </label>
          <Input value={workspace} onChange={setWorkspace} placeholder='Leave empty for auto-generated workspace' />
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 8, display: 'block' }}>
            Team Members (select at least 2)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memberOptions.map((option) => (
              <Checkbox
                key={option.key}
                checked={selectedMembers.some((m) => m.key === option.key)}
                onChange={(checked) => handleToggleMember(option, checked)}
              >
                <span style={{ marginLeft: 4 }}>
                  {option.label} <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>({option.type})</span>
                </span>
              </Checkbox>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 4, display: 'block' }}>
            Initial Message (optional)
          </label>
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
