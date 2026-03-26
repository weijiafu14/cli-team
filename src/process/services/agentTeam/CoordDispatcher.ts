/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuid } from 'uuid';
import type { IAgentTeamMember } from '@/common/storage';
import type { AgentTeamDispatchPolicy } from '@/common/storage';
import { getDatabase } from '@process/database';
import { getAutoCompactionOrchestrator } from '@process/services/autoCompaction';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { CoordFileWatcher } from './CoordFileWatcher';
import type { ICoordTimelineEntry } from './types';

type MemberState = {
  member: IAgentTeamMember;
  busy: boolean;
  pendingMessages: ICoordTimelineEntry[];
  cursorLine: number;
  lastConsensusSignature?: string;
};

type WakeupMessageParams = {
  relCoordDir: string;
  memberId: string;
  messages: ICoordTimelineEntry[];
};

type ConsensusProgress =
  | { status: 'inactive' }
  | { status: 'waiting-decision' }
  | { status: 'awaiting-acks'; finalDecisionId: string; missingConversationIds: string[] }
  | { status: 'reached'; finalDecisionId: string };

const WAKEUP_SUMMARY_LIMIT = 3;
const WAKEUP_FILE_HINT_LIMIT = 3;

function buildWakeupSummaryLines(messages: ICoordTimelineEntry[]): string[] {
  return messages
    .slice(-WAKEUP_SUMMARY_LIMIT)
    .map((msg) => `- ${msg.type} from=${msg.from}${msg.summary ? ` | ${msg.summary}` : ''}`);
}

function buildWakeupFileHints(messages: ICoordTimelineEntry[]): string[] {
  const allFiles = messages.flatMap((message) => message.files || []);
  if (allFiles.length === 0) {
    return [];
  }

  const visibleFiles = allFiles.slice(0, WAKEUP_FILE_HINT_LIMIT).map((filePath) => `- ${filePath}`);
  const remainingCount = allFiles.length - visibleFiles.length;

  return [
    `Attached files: ${allFiles.length}`,
    ...visibleFiles,
    ...(remainingCount > 0 ? [`- ... (+${remainingCount} more)`] : []),
  ];
}

export function buildCoordWakeupMessage({ relCoordDir, memberId, messages }: WakeupMessageParams): string {
  const topics = Array.from(
    new Set(messages.map((msg) => msg.topic).filter((topic): topic is string => Boolean(topic)))
  );

  const lines = [
    '[Internal Agent Team Wakeup]',
    'Scheduler notice only. Do not echo or quote it into chat or coord.',
    `Read now: python3 ${relCoordDir}/scripts/coord_read.py --messages ${relCoordDir}/messages.jsonl --state-dir ${relCoordDir}/state --agent-id ${memberId}`,
    `Source of truth: ${relCoordDir}/TEAM.md, ${relCoordDir}/protocol.md`,
    'Write back via coord_write.py with --summary.',
    "Write coord summary/body in the user's language so the user can read messages.jsonl directly.",
    'If /consensus is active, ACK the final decision with --reply-to <decision-id>.',
    `Unread: ${messages.length}`,
    topics.length > 0 ? `Topics: ${topics.join(', ')}` : '',
    messages.length > 0 ? 'Recent unread:' : '',
    ...buildWakeupSummaryLines(messages),
    ...buildWakeupFileHints(messages),
  ];

  return lines.filter(Boolean).join('\n');
}

function matchesConsensusScope(consensusEntry: ICoordTimelineEntry, candidate: ICoordTimelineEntry): boolean {
  if (consensusEntry.task_id && candidate.task_id) {
    return consensusEntry.task_id === candidate.task_id;
  }
  if (consensusEntry.task_id && !candidate.task_id) {
    return false;
  }
  if (consensusEntry.topic && candidate.topic) {
    return consensusEntry.topic === candidate.topic;
  }
  if (consensusEntry.topic && !candidate.topic) {
    return false;
  }
  return true;
}

export function evaluateConsensusProgress(
  timeline: ICoordTimelineEntry[],
  members: IAgentTeamMember[]
): ConsensusProgress {
  const latestConsensus = timeline
    .map((entry, index) => ({ entry, index }))
    .slice()
    .toReversed()
    .find(({ entry }) => {
      return entry.type === 'consensus';
    });

  if (!latestConsensus) {
    return { status: 'inactive' };
  }

  const { entry: consensusEntry, index: consensusIndex } = latestConsensus;
  const hasUserMessageAfterConsensus = timeline.slice(consensusIndex + 1).some((entry) => entry.role === 'user');
  if (hasUserMessageAfterConsensus) {
    return { status: 'inactive' };
  }

  const consensusWindow = timeline.slice(consensusIndex + 1);
  const scopedCandidates = consensusWindow
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => matchesConsensusScope(consensusEntry, entry));

  // Only `decision` can become the ACK target. `conclusion` remains a human-facing
  // summary node and must not silently supersede the final decision ID.
  const decisionCandidates = scopedCandidates.filter(({ entry }) => entry.type === 'decision');

  if (decisionCandidates.length === 0) {
    return { status: 'waiting-decision' };
  }

  // Check ALL decisions: if any single decision has been ACK'd by all members, consensus is reached.
  // This prevents a later decision from invalidating earlier ACKs.
  for (const candidate of decisionCandidates) {
    const candidateAckFroms = new Set(
      consensusWindow
        .filter((entry) => entry.type === 'ack' && entry.reply_to === candidate.entry.id)
        .map((entry) => entry.from)
    );
    const allAcked = members.every((member) =>
      [member.memberId, member.name, member.conversationId].some((identity) => candidateAckFroms.has(identity))
    );
    if (allAcked) {
      return { status: 'reached', finalDecisionId: candidate.entry.id };
    }
  }

  // No decision has full ACK coverage yet. Use the latest decision as the target for reminders.
  const latestDecision = decisionCandidates[decisionCandidates.length - 1]!;
  const finalDecisionId = latestDecision.entry.id;
  const ackFroms = new Set(
    consensusWindow
      .filter((entry) => entry.type === 'ack' && entry.reply_to === finalDecisionId)
      .map((entry) => entry.from)
  );

  const missingConversationIds = members
    .filter(
      (member) => ![member.memberId, member.name, member.conversationId].some((identity) => ackFroms.has(identity))
    )
    .map((member) => member.conversationId);

  return {
    status: 'awaiting-acks',
    finalDecisionId,
    missingConversationIds,
  };
}

/**
 * Dispatches coord messages to team member agents.
 * Watches messages.jsonl, routes new messages to the correct member,
 * and enforces busy gate + per-member queue.
 */
export class CoordDispatcher {
  private watcher: CoordFileWatcher;
  private memberStates = new Map<string, MemberState>();
  private busyPollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(
    private readonly coordDir: string,
    private readonly members: IAgentTeamMember[],
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly dispatchPolicy: AgentTeamDispatchPolicy,
    private readonly onConsensusReached?: () => void,
    private readonly onTimelineUpdate?: (entries: ICoordTimelineEntry[]) => void
  ) {
    this.watcher = new CoordFileWatcher(coordDir);

    for (const member of members) {
      this.memberStates.set(member.conversationId, {
        member,
        busy: false,
        pendingMessages: [],
        cursorLine: 0,
      });
    }
  }

  /** Start watching and dispatching */
  start(): void {
    if (this.destroyed) return;

    this.watcher.start((newMessages) => {
      // Emit live timeline updates for all new coord lines (including agent-written)
      this.onTimelineUpdate?.(newMessages);
      this.handleNewMessages(newMessages);
    });
  }

  /** Stop dispatching and clean up */
  stop(): void {
    this.destroyed = true;
    this.watcher.stop();
    if (this.busyPollTimer) {
      clearInterval(this.busyPollTimer);
      this.busyPollTimer = null;
    }
    this.memberStates.clear();
  }

  /** Abort all running member agents: kill tasks, clear queues, reset busy states */
  abortAll(): void {
    for (const state of this.memberStates.values()) {
      state.pendingMessages = [];
      state.busy = false;
      this.workerTaskManager.kill(state.member.conversationId);
    }
    this.stopBusyPolling();
  }

  /**
   * Interrupt specific members (or all if no targets given).
   * Kills their running tasks and resets busy state so the next dispatched
   * message will spawn a fresh agent process that resumes the same ACP session.
   */
  async interruptMembers(targetMemberIds?: string[]): Promise<void> {
    const pendingStops: Promise<void>[] = [];
    for (const state of this.memberStates.values()) {
      const shouldInterrupt =
        !targetMemberIds ||
        targetMemberIds.length === 0 ||
        targetMemberIds.includes(state.member.memberId) ||
        targetMemberIds.includes(state.member.conversationId);

      if (shouldInterrupt) {
        state.pendingMessages = [];
        state.busy = false;
        pendingStops.push(this.stopAndKillTask(state.member.conversationId));
      }
    }
    await Promise.all(pendingStops);
    this.syncBusyPolling();
  }

  private async stopAndKillTask(conversationId: string): Promise<void> {
    const task = this.workerTaskManager.getTask(conversationId);
    if (task) {
      try {
        await task.stop();
      } catch (err) {
        console.warn(`[CoordDispatcher] Failed to stop task before interrupt for ${conversationId}:`, err);
      }
    }
    this.workerTaskManager.kill(conversationId);
  }

  private handleNewMessages(messages: ICoordTimelineEntry[]): void {
    for (const msg of messages) {
      // Determine target members
      const targets = this.resolveTargets(msg);

      for (const conversationId of targets) {
        const state = this.memberStates.get(conversationId);
        if (!state) continue;

        // Skip messages from this member itself
        if (msg.from === state.member.memberId || msg.from === state.member.name) {
          continue;
        }

        if (state.busy) {
          this.enqueuePendingMessage(state, msg);
        } else {
          this.dispatchToMember(state, msg);
        }
      }
    }
  }

  private resolveTargets(msg: ICoordTimelineEntry): string[] {
    // User messages wake all members unless they use @mention (dispatch=targets)
    if (msg.role === 'user' && msg.dispatch !== 'targets') {
      return Array.from(this.memberStates.keys());
    }

    // Respect dispatch field
    const dispatch = msg.dispatch || 'all';

    if (dispatch === 'none') {
      return [];
    }

    if (dispatch === 'targets' && msg.to && msg.to.length > 0) {
      // Resolve target identities to conversationIds
      const targets: string[] = [];
      for (const target of msg.to) {
        if (target === '*') {
          return Array.from(this.memberStates.keys());
        }
        if (target === 'user') {
          continue;
        }
        // Match by conversationId, memberId, or member name
        for (const state of this.memberStates.values()) {
          if (
            state.member.conversationId === target ||
            state.member.memberId === target ||
            state.member.name === target
          ) {
            targets.push(state.member.conversationId);
          }
        }
      }
      return targets;
    }

    // dispatch=all or unset: broadcast to all members
    return Array.from(this.memberStates.keys());
  }

  private async dispatchToMember(state: MemberState, msg: ICoordTimelineEntry): Promise<void> {
    state.busy = true;
    this.ensureBusyPolling();

    // Check if this member's session is poisoned and needs a fresh start
    try {
      const orchestrator = getAutoCompactionOrchestrator();
      if (orchestrator.isSessionPoisoned(state.member.conversationId)) {
        console.log(`[CoordDispatcher] Session poisoned for ${state.member.name}, resetting before dispatch`);
        // Interrupt the member to force a fresh session on next getOrBuildTask
        await this.interruptMembers([state.member.memberId]);
        this.clearCodexAcpResumeStateIfNeeded(state.member);
        // Clear both poisoned state AND stale action closures so the new agent can re-register
        orchestrator.removeState(state.member.conversationId);
        orchestrator.clearPoisonedState(state.member.conversationId);
      }
    } catch {
      // autoCompaction module not loaded yet — skip check
    }

    const coordText = msg.from === 'coord-dispatcher' && msg.body ? msg.body : this.buildWakeupMessage(state, [msg]);

    try {
      const task = await this.workerTaskManager.getOrBuildTask(state.member.conversationId);
      await task.sendMessage({
        input: coordText,
        content: coordText,
        msg_id: uuid(),
        files: msg.files || [],
        internal: true,
      });
    } catch (err) {
      console.error(`[CoordDispatcher] Failed to dispatch to ${state.member.name}:`, err);

      // Track consecutive errors for session health monitoring
      try {
        const errorMsg = err instanceof Error ? err.message : String(err);
        getAutoCompactionOrchestrator().reportError(state.member.conversationId, errorMsg);
      } catch {
        // autoCompaction module not loaded yet — skip
      }

      state.busy = false;
      this.syncBusyPolling();
    }
  }

  private clearCodexAcpResumeStateIfNeeded(member: IAgentTeamMember): void {
    if (member.type !== 'acp' || member.backend !== 'codex') {
      return;
    }

    try {
      const result = getDatabase().getConversation(member.conversationId);
      if (!result.success || !result.data || result.data.type !== 'acp') {
        return;
      }

      const conversation = result.data;
      const existingExtra = (conversation.extra || {}) as Record<string, unknown>;
      const { acpSessionId: _acpSessionId, acpSessionUpdatedAt: _acpSessionUpdatedAt, ...restExtra } = existingExtra;

      getDatabase().updateConversation(member.conversationId, {
        extra: restExtra,
      } as Partial<typeof conversation>);
    } catch (err) {
      console.warn(`[CoordDispatcher] Failed to clear codex ACP resume state for ${member.conversationId}:`, err);
    }
  }

  private enqueuePendingMessage(state: MemberState, msg: ICoordTimelineEntry): void {
    const shouldPrioritize =
      this.dispatchPolicy === 'interrupt' ||
      (this.dispatchPolicy === 'user-priority' && (msg.role === 'user' || msg.type === 'consensus'));

    if (shouldPrioritize) {
      state.pendingMessages.unshift(msg);
      return;
    }

    state.pendingMessages.push(msg);
  }

  private refreshBusyStates(): void {
    let hasBusyMembers = false;

    for (const state of this.memberStates.values()) {
      if (!state.busy) {
        continue;
      }

      const task = this.workerTaskManager.getTask(state.member.conversationId);
      const isStillBusy = task && (task.status === 'pending' || task.status === 'running');
      if (isStillBusy) {
        hasBusyMembers = true;
        continue;
      }

      if (!isStillBusy) {
        state.busy = false;
        this.drainQueue(state);
        this.enforceConsensusIfNeeded(state);
      }
    }

    if (!hasBusyMembers && !this.hasBusyMembers()) {
      this.stopBusyPolling();
    }
  }

  private drainQueue(state: MemberState): void {
    if (state.pendingMessages.length === 0) return;

    // Batch pending messages into a single dispatch
    const pending = state.pendingMessages.splice(0);
    const batchText = this.buildWakeupMessage(state, pending);

    const batchMsg: ICoordTimelineEntry = {
      id: `batch-${uuid()}`,
      ts: new Date().toISOString(),
      from: 'coord-dispatcher',
      role: 'system',
      type: 'update',
      summary: `${pending.length} queued coord messages`,
      body: batchText,
    };

    this.dispatchToMember(state, batchMsg);
  }

  private enforceConsensusIfNeeded(state: MemberState): void {
    if (state.pendingMessages.length > 0) return;

    const timeline = this.watcher.readAll();
    const progress = evaluateConsensusProgress(timeline, this.members);

    if (progress.status === 'inactive' || progress.status === 'waiting-decision') {
      state.lastConsensusSignature = undefined;
      return;
    }

    if (progress.status === 'reached') {
      state.lastConsensusSignature = undefined;
      this.onConsensusReached?.();
      return;
    }

    const missingMembers = progress.missingConversationIds
      .map((conversationId) => this.memberStates.get(conversationId))
      .filter((memberState): memberState is MemberState => Boolean(memberState));

    const signature = `${progress.finalDecisionId}:${missingMembers
      .map((memberState) => memberState.member.memberId)
      .slice()
      .toSorted()
      .join(',')}`;
    if (state.lastConsensusSignature === signature) {
      return;
    }

    const isTargetMissing = missingMembers.some(
      (memberState) => memberState.member.conversationId === state.member.conversationId
    );
    if (!isTargetMissing) {
      state.lastConsensusSignature = signature;
      return;
    }

    state.lastConsensusSignature = signature;
    const reminder: ICoordTimelineEntry = {
      id: `consensus-reminder-${uuid()}`,
      ts: new Date().toISOString(),
      from: 'coord-dispatcher',
      role: 'system',
      type: 'consensus-reminder',
      summary: `Consensus still pending. Missing ACK from ${missingMembers.map((member) => member.member.name).join(', ')}`,
      body: 'Consensus has not been reached yet. Emit an explicit ack with --reply-to <final-decision-id> before ending.',
    };
    void this.dispatchToMember(state, reminder);
  }

  private hasBusyMembers(): boolean {
    return Array.from(this.memberStates.values()).some((state) => state.busy);
  }

  private ensureBusyPolling(): void {
    if (this.busyPollTimer) {
      return;
    }

    this.busyPollTimer = setInterval(() => {
      this.refreshBusyStates();
    }, 500);
  }

  private stopBusyPolling(): void {
    if (!this.busyPollTimer) {
      return;
    }

    clearInterval(this.busyPollTimer);
    this.busyPollTimer = null;
  }

  private syncBusyPolling(): void {
    if (this.hasBusyMembers()) {
      this.ensureBusyPolling();
      return;
    }

    this.stopBusyPolling();
  }

  private buildWakeupMessage(state: MemberState, messages: ICoordTimelineEntry[]): string {
    return buildCoordWakeupMessage({
      relCoordDir: this.getRelCoordDir(),
      memberId: state.member.memberId,
      messages,
    });
  }

  /** Get the relative coord directory path (e.g. .agents/teams/<teamId>/coord) */
  private getRelCoordDir(): string {
    // coordDir is absolute like /path/to/workspace/.agents/teams/<teamId>/coord
    // Extract from .agents onwards
    const idx = this.coordDir.indexOf('.agents');
    return idx >= 0 ? this.coordDir.slice(idx) : this.coordDir;
  }
}
