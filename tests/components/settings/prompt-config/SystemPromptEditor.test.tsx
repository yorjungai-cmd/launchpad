/**
 * Task 7 — SystemPromptEditor component tests
 *
 * Verifies:
 * 1. Renders with initialValue pre-filled in textarea
 * 2. Shows character count (e.g. "25 / 8000")
 * 3. Save button calls admin.updateSystemPrompt mutation with correct value
 * 4. Shows success state (toast) after save
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { SystemPromptEditor } from "@/components/settings/prompt-config/SystemPromptEditor";

// ─── Mock tRPC api ────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  api: {
    admin: {
      updateSystemPrompt: {
        useMutation: vi.fn((opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => ({
          mutate: (input: { systemPrompt: string }) => {
            mockMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        })),
      },
    },
    useUtils: () => ({
      admin: {
        getPromptConfig: {
          invalidate: mockInvalidate,
        },
      },
    }),
  },
}));

// ─── Mock ToastProvider ───────────────────────────────────────────────────────

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/components/shared/ToastProvider", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// ─── Mock prompt-config-defaults (only what component uses) ─────────────────

vi.mock("@/lib/document-generation/prompt-config-defaults", () => ({
  DEFAULT_PROMPT_CONFIG: {
    systemPrompt: "Default system prompt for testing",
    sections: {},
  },
  DOCUMENT_TYPES_IN_WORKFLOW_ORDER: [],
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderEditor(
  props: {
    initialValue?: string;
    onDirtyChange?: (dirty: boolean) => void;
    onSaved?: () => void;
  } = {}
) {
  return render(
    <SystemPromptEditor
      initialValue={props.initialValue ?? "Hello world initial prompt"}
      onDirtyChange={props.onDirtyChange ?? vi.fn()}
      onSaved={props.onSaved}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SystemPromptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Renders with initialValue pre-filled ───────────────────────────────

  it("renders textarea pre-filled with initialValue", () => {
    const initial = "You are a helpful assistant.";
    renderEditor({ initialValue: initial });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(initial);
  });

  // ── 2. Shows character count ──────────────────────────────────────────────

  it("shows character count matching initialValue length", () => {
    const initial = "You are a helpful assistant.";
    renderEditor({ initialValue: initial });

    // e.g. "28 / 8000"
    expect(screen.getByText(`${initial.length} / 8000`)).toBeInTheDocument();
  });

  it("updates character count as user types", async () => {
    const user = userEvent.setup();
    const initial = "Short prompt";
    renderEditor({ initialValue: initial });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, "!");

    expect(screen.getByText(`${initial.length + 1} / 8000`)).toBeInTheDocument();
  });

  // ── 3. Save button calls mutation with correct value ──────────────────────

  it("calls admin.updateSystemPrompt with the current textarea value on save", async () => {
    const user = userEvent.setup();
    const initial = "Original prompt";
    renderEditor({ initialValue: initial });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, " updated");

    const saveButton = screen.getByRole("button", { name: /บันทึก system prompt/i });
    await user.click(saveButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ systemPrompt: "Original prompt updated" });
  });

  it("save button is disabled when value equals initialValue (not dirty)", () => {
    renderEditor({ initialValue: "same value" });

    const saveButton = screen.getByRole("button", { name: /บันทึก system prompt/i });
    expect(saveButton).toBeDisabled();
  });

  it("save button is enabled after user modifies textarea", async () => {
    const user = userEvent.setup();
    renderEditor({ initialValue: "original" });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, " changed");

    const saveButton = screen.getByRole("button", { name: /บันทึก system prompt/i });
    expect(saveButton).not.toBeDisabled();
  });

  // ── 4. Shows success state after save ────────────────────────────────────

  it("calls toast.success after successful save", async () => {
    const user = userEvent.setup();
    renderEditor({ initialValue: "initial text" });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, " more text");

    const saveButton = screen.getByRole("button", { name: /บันทึก system prompt/i });
    await user.click(saveButton);

    expect(mockToastSuccess).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith("บันทึก System Prompt เรียบร้อยแล้ว");
  });

  it("calls onSaved callback after successful save", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderEditor({ initialValue: "initial text", onSaved });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, " changes");

    await user.click(screen.getByRole("button", { name: /บันทึก system prompt/i }));

    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("invalidates tRPC cache after successful save", async () => {
    const user = userEvent.setup();
    renderEditor({ initialValue: "initial" });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, " changed");

    await user.click(screen.getByRole("button", { name: /บันทึก system prompt/i }));

    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  // ── onDirtyChange callback ────────────────────────────────────────────────

  it("calls onDirtyChange(true) when value differs from initialValue", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderEditor({ initialValue: "clean", onDirtyChange });

    const textarea = screen.getByRole("textbox", { name: /system prompt/i });
    await user.type(textarea, "x");

    // Should have been called with true at some point
    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenCalledWith(true);
    });
  });
});
