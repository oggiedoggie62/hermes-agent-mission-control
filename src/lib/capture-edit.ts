/* agent: codex | model: gpt-5 | date: 2026-07-21 */
export interface CaptureEditState {
  editingId: string | null;
  draft: string;
  saving: boolean;
  error: string | null;
}

export const EMPTY_CAPTURE_EDIT: CaptureEditState = {
  editingId: null,
  draft: "",
  saving: false,
  error: null,
};

export function beginCaptureEdit(id: string, title: string): CaptureEditState {
  return { editingId: id, draft: title, saving: false, error: null };
}

export function cancelCaptureEdit(): CaptureEditState {
  return EMPTY_CAPTURE_EDIT;
}

export function failCaptureEdit(state: CaptureEditState, error: string): CaptureEditState {
  return { ...state, saving: false, error };
}

export interface EditableCapture {
  id: string;
  title: string;
  updatedAt: string;
}

export async function saveCaptureEdit<T extends EditableCapture>(
  state: CaptureEditState,
  capture: T,
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ state: CaptureEditState; capture: T | null; error: string | null }> {
  const title = state.draft.trim();
  if (!title) {
    const error = "Capture text cannot be blank.";
    return { state: failCaptureEdit(state, error), capture: null, error };
  }

  try {
    const response = await request(`/api/ideas/${capture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", title, expectedUpdatedAt: capture.updatedAt }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Failed to save capture";
      return { state: failCaptureEdit(state, error), capture: null, error };
    }
    return { state: cancelCaptureEdit(), capture: data as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save capture";
    return { state: failCaptureEdit(state, message), capture: null, error: message };
  }
}
