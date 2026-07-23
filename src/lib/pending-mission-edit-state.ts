/* agent: codex | model: gpt-5 | date: 2026-07-22 */
export interface MissionEditDraft {
  title: string;
  description: string;
  agentId: string;
  priority: string;
  executionMode: "AUTO" | "MANUAL";
}

export interface PendingMissionEditState {
  open: boolean;
  draft: MissionEditDraft;
  error: string | null;
}

export function openPendingMissionEdit(draft: MissionEditDraft): PendingMissionEditState {
  return { open: true, draft, error: null };
}

export function changePendingMissionEdit(
  state: PendingMissionEditState,
  patch: Partial<MissionEditDraft>,
): PendingMissionEditState {
  return { ...state, draft: { ...state.draft, ...patch }, error: null };
}

export function failPendingMissionEdit(
  state: PendingMissionEditState,
  error: string,
): PendingMissionEditState {
  return { ...state, open: true, error };
}

export function closePendingMissionEdit(state: PendingMissionEditState): PendingMissionEditState {
  return { ...state, open: false, error: null };
}

export function succeedPendingMissionEdit(state: PendingMissionEditState): PendingMissionEditState {
  return closePendingMissionEdit(state);
}
