/**
 * Task 10 — PromptConfigTab component tests
 *
 * Verifies:
 * 1. Shows loading skeleton while query is pending
 * 2. Shows SystemPromptEditor when global selected (default)
 * 3. Shows DocTypeSectionEditor when a doc type is selected
 * 4. DocTypeNav renders with correct props
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { PromptConfigTab } from "@/components/settings/PromptConfigTab";

// ─── Mock tRPC api ────────────────────────────────────────────────────────────

const mockUseQuery = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  api: {
    admin: {
      getPromptConfig: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

// ─── Mock child components ────────────────────────────────────────────────────

vi.mock("@/components/settings/prompt-config/DocTypeNav", () => ({
  DocTypeNav: ({
    selected,
    dirtyTypes,
    onSelect,
  }: {
    selected: string;
    dirtyTypes: Set<string>;
    onSelect: (s: string) => void;
  }) => (
    <nav
      data-testid="doc-type-nav"
      data-selected={selected}
      data-dirty-types={JSON.stringify([...dirtyTypes])}
    >
      <button type="button" onClick={() => onSelect("poc_proposal")}>
        Select poc_proposal
      </button>
      <button type="button" onClick={() => onSelect("global")}>
        Select global
      </button>
    </nav>
  ),
}));

vi.mock("@/components/settings/prompt-config/SystemPromptEditor", () => ({
  SystemPromptEditor: ({
    initialValue,
    onDirtyChange,
  }: {
    initialValue: string;
    onDirtyChange: (d: boolean) => void;
  }) => (
    <div data-testid="system-prompt-editor" data-initial-value={initialValue}>
      <button type="button" onClick={() => onDirtyChange(true)}>
        Mark global dirty
      </button>
    </div>
  ),
}));

vi.mock("@/components/settings/prompt-config/DocTypeSectionEditor", () => ({
  DocTypeSectionEditor: ({
    documentType,
    onDirtyChange,
  }: {
    documentType: string;
    currentSections: Record<string, string>;
    systemPrompt: string;
    onDirtyChange: (d: boolean) => void;
  }) => (
    <div data-testid="doc-type-section-editor" data-document-type={documentType}>
      <button type="button" onClick={() => onDirtyChange(true)}>
        Mark doc type dirty
      </button>
    </div>
  ),
}));

// ─── Mock UI components used in loading/error states ─────────────────────────

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadedQueryResult = {
  data: {
    systemPrompt: "You are a helpful assistant.",
    sections: {
      poc_proposal: {
        poc_objective: "POC objective instruction",
      },
    },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

const loadingQueryResult = {
  data: undefined,
  isLoading: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PromptConfigTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Shows loading skeleton while query is pending ─────────────────────

  it("shows loading skeleton when query is loading", () => {
    mockUseQuery.mockReturnValue(loadingQueryResult);

    const { container } = render(<PromptConfigTab />);

    // The skeleton wrapper has aria-busy="true"
    const loadingEl =
      container.querySelector('[aria-busy="true"]') ?? screen.queryByLabelText(/กำลังโหลด/);

    expect(loadingEl).not.toBeNull();
    // Multiple skeleton placeholders should be rendered
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("does not render DocTypeNav while loading", () => {
    mockUseQuery.mockReturnValue(loadingQueryResult);

    render(<PromptConfigTab />);

    expect(screen.queryByTestId("doc-type-nav")).not.toBeInTheDocument();
  });

  // ── 2. Shows SystemPromptEditor when global selected (default) ───────────

  it("shows SystemPromptEditor when query is loaded and selection is global (default)", () => {
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    expect(screen.getByTestId("system-prompt-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("doc-type-section-editor")).not.toBeInTheDocument();
  });

  it("passes systemPrompt as initialValue to SystemPromptEditor", () => {
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    const editor = screen.getByTestId("system-prompt-editor");
    expect(editor).toHaveAttribute("data-initial-value", "You are a helpful assistant.");
  });

  // ── 3. Shows DocTypeSectionEditor when a doc type is selected ────────────

  it("shows DocTypeSectionEditor after selecting a document type", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    // Click the mock button that triggers onSelect("poc_proposal")
    await user.click(screen.getByText("Select poc_proposal"));

    expect(screen.getByTestId("doc-type-section-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("system-prompt-editor")).not.toBeInTheDocument();
  });

  it("passes the selected documentType to DocTypeSectionEditor", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    await user.click(screen.getByText("Select poc_proposal"));

    const editor = screen.getByTestId("doc-type-section-editor");
    expect(editor).toHaveAttribute("data-document-type", "poc_proposal");
  });

  it("switches back to SystemPromptEditor when global is re-selected", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    await user.click(screen.getByText("Select poc_proposal"));
    expect(screen.getByTestId("doc-type-section-editor")).toBeInTheDocument();

    await user.click(screen.getByText("Select global"));
    expect(screen.getByTestId("system-prompt-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("doc-type-section-editor")).not.toBeInTheDocument();
  });

  // ── 4. DocTypeNav renders with correct props ──────────────────────────────

  it("renders DocTypeNav with selected='global' initially", () => {
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    const nav = screen.getByTestId("doc-type-nav");
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("data-selected", "global");
  });

  it("DocTypeNav receives updated selected prop when a doc type is chosen", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    await user.click(screen.getByText("Select poc_proposal"));

    const nav = screen.getByTestId("doc-type-nav");
    expect(nav).toHaveAttribute("data-selected", "poc_proposal");
  });

  it("DocTypeNav receives dirtyTypes reflecting global dirty state", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    // Initially not dirty
    const nav = screen.getByTestId("doc-type-nav");
    expect(JSON.parse(nav.getAttribute("data-dirty-types") ?? "[]")).toEqual([]);

    // Mark global dirty via SystemPromptEditor's mock button
    await user.click(screen.getByText("Mark global dirty"));

    expect(JSON.parse(nav.getAttribute("data-dirty-types") ?? "[]")).toContain("global");
  });

  it("DocTypeNav receives dirtyTypes reflecting doc type dirty state", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(loadedQueryResult);

    render(<PromptConfigTab />);

    // Navigate to a doc type
    await user.click(screen.getByText("Select poc_proposal"));

    // Mark it dirty
    await user.click(screen.getByText("Mark doc type dirty"));

    const nav = screen.getByTestId("doc-type-nav");
    expect(JSON.parse(nav.getAttribute("data-dirty-types") ?? "[]")).toContain("poc_proposal");
  });

  // ── Error state ───────────────────────────────────────────────────────────

  it("shows error state when query fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Network error" },
      refetch: vi.fn(),
    });

    render(<PromptConfigTab />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("โหลดการตั้งค่า Prompt ไม่สำเร็จ")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
