/**
 * Task 9 — DocTypeSectionEditor component tests
 *
 * Verifies:
 * 1. Renders sections for the given documentType
 * 2. Editing a section marks it dirty and enables Save
 * 3. Save calls updateDocumentTypeSections with all current values
 * 4. Reset calls resetPromptDocumentType
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DocTypeSectionEditor } from "@/components/settings/prompt-config/DocTypeSectionEditor";

// ─── Mock tRPC api ────────────────────────────────────────────────────────────

const mockSaveMutate = vi.fn();
const mockResetMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  api: {
    admin: {
      updateDocumentTypeSections: {
        useMutation: vi.fn((opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => ({
          mutate: (input: { documentType: string; sections: Record<string, string> }) => {
            mockSaveMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        })),
      },
      resetPromptDocumentType: {
        useMutation: vi.fn((opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => ({
          mutate: (input: { documentType: string }) => {
            mockResetMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        })),
      },
      testSectionPrompt: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
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

// ─── Mock prompt-config-defaults ─────────────────────────────────────────────

vi.mock("@/lib/document-generation/prompt-config-defaults", () => ({
  DEFAULT_PROMPT_CONFIG: {
    systemPrompt: "Default system prompt",
    sections: {
      poc_proposal: {
        poc_objective: "Default POC objective instruction",
        poc_scope: "Default POC scope instruction",
        poc_timeline: "Default POC timeline instruction",
      },
      feasibility_report: {
        executive_summary: "Default executive summary instruction",
      },
    },
  },
  DOCUMENT_TYPES_IN_WORKFLOW_ORDER: [
    { type: "feasibility_report", label: "รายงานความเป็นไปได้" },
    { type: "poc_proposal", label: "ข้อเสนอ POC" },
  ],
}));

// ─── Mock window.confirm ─────────────────────────────────────────────────────

const mockConfirm = vi.fn(() => true);
Object.defineProperty(window, "confirm", { value: mockConfirm, writable: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RenderProps {
  documentType?: "poc_proposal" | "feasibility_report";
  currentSections?: Record<string, string>;
  systemPrompt?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

function renderEditor(props: RenderProps = {}) {
  return render(
    <DocTypeSectionEditor
      documentType={props.documentType ?? "poc_proposal"}
      currentSections={props.currentSections ?? {}}
      systemPrompt={props.systemPrompt ?? "You are a helpful assistant."}
      onDirtyChange={props.onDirtyChange ?? vi.fn()}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DocTypeSectionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(true);
  });

  // ── 1. Renders sections for the given documentType ────────────────────────

  it("renders the document type label as heading", () => {
    renderEditor({ documentType: "poc_proposal" });
    expect(screen.getByText("ข้อเสนอ POC")).toBeInTheDocument();
  });

  it("renders SectionTextarea for each section of the documentType", () => {
    renderEditor({ documentType: "poc_proposal" });
    // poc_proposal has 3 sections: poc_objective, poc_scope, poc_timeline
    expect(screen.getByText("วัตถุประสงค์ POC")).toBeInTheDocument();
    expect(screen.getByText("ขอบเขต POC")).toBeInTheDocument();
    expect(screen.getByText("ไทม์ไลน์ POC")).toBeInTheDocument();
  });

  it("does not render sections from a different documentType", () => {
    renderEditor({ documentType: "poc_proposal" });
    // executive_summary belongs to feasibility_report, not poc_proposal
    expect(screen.queryByText("บทสรุปผู้บริหาร")).not.toBeInTheDocument();
  });

  it("pre-fills section textarea with currentSections value", () => {
    renderEditor({
      documentType: "poc_proposal",
      currentSections: { poc_objective: "Custom POC objective text" },
    });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    expect(textarea).toHaveValue("Custom POC objective text");
  });

  it("falls back to default instruction when currentSections has no override", () => {
    renderEditor({
      documentType: "poc_proposal",
      currentSections: {},
    });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    expect(textarea).toHaveValue("Default POC objective instruction");
  });

  it("renders Reset All button", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /reset all/i })).toBeInTheDocument();
  });

  // ── 2. Editing a section marks it dirty and enables Save ─────────────────

  it("Save button is disabled when no changes have been made", () => {
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    const saveButton = screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i });
    expect(saveButton).toBeDisabled();
  });

  it("Save button is enabled after editing a section", async () => {
    const user = userEvent.setup();
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, " extra text");

    const saveButton = screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i });
    expect(saveButton).not.toBeDisabled();
  });

  it("calls onDirtyChange(true) when a section is edited", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderEditor({ documentType: "poc_proposal", currentSections: {}, onDirtyChange });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, "x");

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenCalledWith(true);
    });
  });

  it("shows unsaved changes indicator when dirty", async () => {
    const user = userEvent.setup();
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, "change");

    expect(screen.getByText(/มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก/)).toBeInTheDocument();
  });

  // ── 3. Save calls updateDocumentTypeSections with all current values ──────

  it("calls admin.updateDocumentTypeSections with documentType and sections on Save", async () => {
    const user = userEvent.setup();
    renderEditor({
      documentType: "poc_proposal",
      currentSections: { poc_objective: "Existing objective" },
    });

    // Edit one section
    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.clear(textarea);
    await user.type(textarea, "Updated objective");

    const saveButton = screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i });
    await user.click(saveButton);

    expect(mockSaveMutate).toHaveBeenCalledTimes(1);
    expect(mockSaveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "poc_proposal",
        sections: expect.objectContaining({
          poc_objective: "Updated objective",
        }),
      })
    );
  });

  it("Save includes all section values (not just edited ones)", async () => {
    const user = userEvent.setup();
    renderEditor({
      documentType: "poc_proposal",
      currentSections: {},
    });

    // Edit only poc_objective
    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, " more");

    await user.click(screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i }));

    // Should include all 3 sections, not just the edited one
    const call = mockSaveMutate.mock.calls[0][0] as {
      documentType: string;
      sections: Record<string, string>;
    };
    expect(Object.keys(call.sections)).toContain("poc_scope");
    expect(Object.keys(call.sections)).toContain("poc_timeline");
  });

  it("shows success toast after save", async () => {
    const user = userEvent.setup();
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, " changed");

    await user.click(screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i }));

    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("บันทึก"));
  });

  it("invalidates admin.getPromptConfig cache after save", async () => {
    const user = userEvent.setup();
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    const textarea = screen.getByRole("textbox", { name: /instruction for วัตถุประสงค์ POC/i });
    await user.type(textarea, " changed");

    await user.click(screen.getByRole("button", { name: /บันทึก ข้อเสนอ POC/i }));

    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  // ── 4. Reset calls resetPromptDocumentType ────────────────────────────────

  it("calls admin.resetPromptDocumentType with documentType when Reset All is confirmed", async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(true);
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    await user.click(screen.getByRole("button", { name: /reset all/i }));

    expect(mockResetMutate).toHaveBeenCalledTimes(1);
    expect(mockResetMutate).toHaveBeenCalledWith({ documentType: "poc_proposal" });
  });

  it("does not call resetPromptDocumentType when confirm is cancelled", async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(false);
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    await user.click(screen.getByRole("button", { name: /reset all/i }));

    expect(mockResetMutate).not.toHaveBeenCalled();
  });

  it("shows success toast after reset", async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(true);
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    await user.click(screen.getByRole("button", { name: /reset all/i }));

    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Reset"));
  });

  it("invalidates admin.getPromptConfig cache after reset", async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(true);
    renderEditor({ documentType: "poc_proposal", currentSections: {} });

    await user.click(screen.getByRole("button", { name: /reset all/i }));

    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });
});
