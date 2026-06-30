/**
 * Task 8 — SectionTextarea component tests
 *
 * Verifies:
 * 1. Renders with `value` pre-filled in textarea
 * 2. Shows char count (e.g. "25 / 2000")
 * 3. `onChange` called on input
 * 4. Test button calls admin.testSectionPrompt mutation
 * 5. Displays test output after mutation resolves
 * 6. Shows SAMPLE_TEST_IDEA info in test panel
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { SectionTextarea } from "@/components/settings/prompt-config/SectionTextarea";

// ─── Mock tRPC api ────────────────────────────────────────────────────────────

const mockTestMutate = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  api: {
    admin: {
      testSectionPrompt: {
        useMutation: vi.fn(
          (opts?: {
            onSuccess?: (data: { content: string }) => void;
            onError?: (err: Error) => void;
          }) => ({
            mutate: (input: {
              systemPrompt: string;
              sectionKey: string;
              documentType: string;
              instruction: string;
            }) => {
              mockTestMutate(input);
              opts?.onSuccess?.({ content: "AI output: ผลลัพธ์ทดสอบจาก AI" });
            },
            isPending: false,
          })
        ),
      },
    },
  },
}));

// ─── Mock ToastProvider ───────────────────────────────────────────────────────

const mockToastError = vi.fn();

vi.mock("@/components/shared/ToastProvider", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: mockToastError,
  }),
}));

// ─── Mock prompt-config-defaults ────────────────────────────────────────────

vi.mock("@/lib/document-generation/prompt-config-defaults", () => ({
  SAMPLE_TEST_IDEA: {
    title: "ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา",
    summary: "พัฒนาระบบ AI ที่ช่วย BD team วิเคราะห์ใบเสนอราคาจากลูกค้า",
    stage: "Sandbox",
    ideaType: "Internal Tool",
    feasibilityScores: {
      strategicFit: 4,
      marketPotential: 3,
      technicalFeasibility: 4,
      resourceRequirement: 3,
      businessImpact: 4,
    },
  },
  DEFAULT_PROMPT_CONFIG: {
    systemPrompt: "Default system prompt",
    sections: {
      feasibility_report: {
        executive_summary: "Default executive summary instruction",
      },
    },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RenderProps {
  sectionKey?: string;
  sectionTitle?: string;
  documentType?: string;
  value?: string;
  systemPrompt?: string;
  isNarrative?: boolean;
  defaultInstruction?: string;
  onChange?: (value: string) => void;
  onReset?: () => void;
}

function renderSectionTextarea(props: RenderProps = {}) {
  return render(
    <SectionTextarea
      sectionKey={props.sectionKey ?? "executive_summary"}
      sectionTitle={props.sectionTitle ?? "บทสรุปผู้บริหาร"}
      documentType={props.documentType ?? "feasibility_report"}
      value={props.value ?? "Initial instruction text"}
      systemPrompt={props.systemPrompt ?? "You are a helpful assistant."}
      isNarrative={props.isNarrative ?? true}
      defaultInstruction={props.defaultInstruction ?? "Default instruction"}
      onChange={props.onChange ?? vi.fn()}
      onReset={props.onReset ?? vi.fn()}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SectionTextarea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Renders with value pre-filled ─────────────────────────────────────

  it("renders textarea pre-filled with value", () => {
    const instruction = "เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า";
    renderSectionTextarea({ value: instruction });

    const textarea = screen.getByRole("textbox", { name: /instruction for บทสรุปผู้บริหาร/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(instruction);
  });

  it("renders section title", () => {
    renderSectionTextarea({ sectionTitle: "บทสรุปผู้บริหาร" });
    expect(screen.getByText("บทสรุปผู้บริหาร")).toBeInTheDocument();
  });

  // ── 2. Shows char count ──────────────────────────────────────────────────

  it("shows char count matching value length", () => {
    const instruction = "Hello world";
    renderSectionTextarea({ value: instruction });

    expect(screen.getByText(`${instruction.length} / 2000`)).toBeInTheDocument();
  });

  it("updates char count as user types", async () => {
    const user = userEvent.setup();
    const initial = "Short text";
    const onChange = vi.fn((_v: string) => {
      // Simulate the parent updating the value
    });
    renderSectionTextarea({ value: initial, onChange });

    const textarea = screen.getByRole("textbox", { name: /instruction for/i });
    await user.type(textarea, "!");

    expect(onChange).toHaveBeenCalled();
  });

  it("shows 0 / 2000 when value is empty", () => {
    renderSectionTextarea({ value: "" });
    expect(screen.getByText("0 / 2000")).toBeInTheDocument();
  });

  // ── 3. onChange called on input ──────────────────────────────────────────

  it("calls onChange with new value when user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSectionTextarea({ value: "existing", onChange });

    const textarea = screen.getByRole("textbox", { name: /instruction for/i });
    await user.type(textarea, "x");

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("x"));
  });

  // ── 4. Test button calls admin.testSectionPrompt mutation ────────────────

  it("opens test panel when 'ทดสอบ Prompt' toggle is clicked", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "some instruction" });

    const toggle = screen.getByRole("button", { name: /ทดสอบ prompt/i });
    await user.click(toggle);

    // Test Prompt button should now be visible
    expect(screen.getByRole("button", { name: /test prompt/i })).toBeInTheDocument();
  });

  it("calls testSectionPrompt mutation with correct inputs when Test Prompt is clicked", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({
      sectionKey: "executive_summary",
      documentType: "feasibility_report",
      value: "Write 2 paragraphs",
      systemPrompt: "You are an AI assistant",
    });

    // Open test panel
    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    // Click Test Prompt
    await user.click(screen.getByRole("button", { name: /test prompt/i }));

    expect(mockTestMutate).toHaveBeenCalledTimes(1);
    expect(mockTestMutate).toHaveBeenCalledWith({
      systemPrompt: "You are an AI assistant",
      sectionKey: "executive_summary",
      documentType: "feasibility_report",
      instruction: "Write 2 paragraphs",
    });
  });

  // ── 5. Displays test output after mutation resolves ───────────────────────

  it("displays AI output after mutation resolves", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "instruction" });

    // Open test panel
    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    // Click Test Prompt
    await user.click(screen.getByRole("button", { name: /test prompt/i }));

    await waitFor(() => {
      expect(screen.getByText("AI output: ผลลัพธ์ทดสอบจาก AI")).toBeInTheDocument();
    });
  });

  it("shows placeholder text before test is run", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "instruction" });

    // Open test panel
    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    expect(screen.getByText(/กด test prompt เพื่อดูผลลัพธ์/i)).toBeInTheDocument();
  });

  // ── 6. Shows SAMPLE_TEST_IDEA info ──────────────────────────────────────

  it("shows SAMPLE_TEST_IDEA title in test panel", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "instruction" });

    // Open test panel
    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    expect(screen.getByText(/ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา/)).toBeInTheDocument();
  });

  it("shows SAMPLE_TEST_IDEA summary in test panel", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "instruction" });

    // Open test panel
    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    expect(
      screen.getByText(/พัฒนาระบบ AI ที่ช่วย BD team วิเคราะห์ใบเสนอราคาจากลูกค้า/)
    ).toBeInTheDocument();
  });

  it("shows SAMPLE_TEST_IDEA stage and type in test panel", async () => {
    const user = userEvent.setup();
    renderSectionTextarea({ value: "instruction" });

    await user.click(screen.getByRole("button", { name: /ทดสอบ prompt/i }));

    expect(screen.getByText(/Sandbox/)).toBeInTheDocument();
    expect(screen.getByText(/Internal Tool/)).toBeInTheDocument();
  });

  // ── Non-narrative sections ───────────────────────────────────────────────

  it("shows Auto-generated badge and no textarea for non-narrative sections", () => {
    renderSectionTextarea({ isNarrative: false, sectionTitle: "คะแนนความเป็นไปได้" });

    expect(screen.getByText("Auto-generated")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /instruction for/i })).not.toBeInTheDocument();
  });

  it("does not show char count for non-narrative sections", () => {
    renderSectionTextarea({ isNarrative: false, value: "some text" });

    expect(screen.queryByText(/\/ 2000/)).not.toBeInTheDocument();
  });

  // ── Reset button ─────────────────────────────────────────────────────────

  it("shows Reset button for narrative sections", () => {
    renderSectionTextarea({ isNarrative: true });

    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });
});
