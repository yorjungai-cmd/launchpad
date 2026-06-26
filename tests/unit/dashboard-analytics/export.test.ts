/**
 * Unit tests — ExportService (export.ts)
 *
 * Covers:
 *   - mock xlsx, verify workbook sheet structure (4 sheets)
 *   - verify triggerPrintPDF() calls window.print()
 *
 * Ref: design/components.md — ExportService (Component 8)
 * Task 7.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock xlsx ────────────────────────────────────────────────────────────────

const mockBookNew = vi.fn(() => ({}));
const mockJsonToSheet = vi.fn((rows: unknown[]) => ({ rows }));
const mockBookAppendSheet = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("xlsx", () => ({
  utils: {
    book_new: mockBookNew,
    json_to_sheet: mockJsonToSheet,
    book_append_sheet: mockBookAppendSheet,
  },
  writeFile: mockWriteFile,
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

import type {
  PipelineReportData,
  ExecutiveSummaryData,
  SourceAnalysisData,
  BDTeamViewData,
  IdeaExportRow,
} from "@/modules/dashboard-analytics/schemas";
import { IdeaStage, SubmitterType } from "@/modules/dashboard-analytics/schemas";

const DATE_RANGE = { from: "2026-01-01T00:00:00.000Z", to: "2026-06-30T23:59:59.000Z" };

const mockSummary: ExecutiveSummaryData = {
  totalIdeas: 20,
  ideaCountByStage: [
    { stage: IdeaStage.SANDBOX, count: 10 },
    { stage: IdeaStage.VALIDATION_SPRINT, count: 5 },
    { stage: IdeaStage.CLOSED_GO, count: 3 },
    { stage: IdeaStage.CLOSED_NO_GO, count: 2 },
  ],
  winNoGoStats: {
    totalClosed: 5,
    closedGo: 3,
    closedNoGo: 2,
    inProgress: 15,
    winRate: 0.6,
  },
  avgTimePerStage: [
    { stage: IdeaStage.SANDBOX, avgDays: 7 },
    { stage: IdeaStage.VALIDATION_SPRINT, avgDays: 14 },
  ],
  dateRange: DATE_RANGE,
};

const mockSourceAnalysis: SourceAnalysisData = {
  totalIdeas: 20,
  bySubmitterType: [
    { submitterType: SubmitterType.EMPLOYEE, count: 12, percentage: 60 },
    { submitterType: SubmitterType.PARTNER, count: 8, percentage: 40 },
  ],
  dateRange: DATE_RANGE,
};

const mockBDWorkload: BDTeamViewData = {
  pendingReviewCount: 3,
  reviewerWorkload: [
    {
      reviewerId: "rev-001",
      reviewerName: "Alice",
      ideaCount: 10,
      byStage: [{ stage: IdeaStage.SANDBOX, count: 5 }],
    },
  ],
  dateRange: DATE_RANGE,
};

const mockIdeas: IdeaExportRow[] = [
  {
    referenceNumber: "REF-001",
    title: "First Idea",
    submitterType: SubmitterType.EMPLOYEE,
    submittedAt: "2026-02-01T09:00:00Z",
    currentStage: IdeaStage.SANDBOX,
    ideaType: "SaaS",
    assignedReviewer: "Alice",
    lastUpdatedAt: "2026-02-05T10:00:00Z",
  },
  {
    referenceNumber: "REF-002",
    title: "Second Idea",
    submitterType: SubmitterType.PARTNER,
    submittedAt: "2026-03-15T09:00:00Z",
    currentStage: IdeaStage.VALIDATION_SPRINT,
    ideaType: "SI",
    assignedReviewer: null,
    lastUpdatedAt: "2026-03-20T10:00:00Z",
  },
];

const mockReportData: PipelineReportData = {
  generatedAt: "2026-06-25T12:00:00Z",
  dateRange: DATE_RANGE,
  summary: mockSummary,
  sourceAnalysis: mockSourceAnalysis,
  bdWorkload: mockBDWorkload,
  ideas: mockIdeas,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("exportToExcel()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a new workbook", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report-test");

    expect(mockBookNew).toHaveBeenCalledOnce();
  });

  it("should append exactly 4 sheets: Summary, Ideas Detail, By Stage, Source", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report-test");

    expect(mockBookAppendSheet).toHaveBeenCalledTimes(4);

    const sheetNames = mockBookAppendSheet.mock.calls.map(
      (call: unknown[]) => call[2] // 3rd arg is the sheet name
    );
    expect(sheetNames).toContain("Summary");
    expect(sheetNames).toContain("Ideas Detail");
    expect(sheetNames).toContain("By Stage");
    expect(sheetNames).toContain("Source");
  });

  it("should call XLSX.writeFile with correct filename", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "my-report-2026");

    expect(mockWriteFile).toHaveBeenCalledWith(expect.anything(), "my-report-2026.xlsx");
  });

  it("Summary sheet should include total ideas, win rate, and pending count rows", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report");

    // First call to json_to_sheet is for the Summary sheet
    const summaryCallArgs = mockJsonToSheet.mock.calls[0]?.[0] as Array<{
      metric: string;
      value: string | number;
    }>;

    expect(summaryCallArgs).toBeDefined();
    const metrics = summaryCallArgs.map((r) => r.metric);
    expect(metrics).toContain("Total Ideas");
    expect(metrics).toContain("Win Rate");
    expect(metrics).toContain("Total Closed");
    expect(metrics).toContain("Pending BD Review");
  });

  it("Ideas Detail sheet rows should match the ideas array length", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report");

    // Second call to json_to_sheet is Ideas Detail
    const ideasCallArgs = mockJsonToSheet.mock.calls[1]?.[0] as unknown[];

    expect(ideasCallArgs).toBeDefined();
    expect(ideasCallArgs).toHaveLength(mockIdeas.length);
  });

  it("By Stage sheet rows should match ideaCountByStage length", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report");

    // Third call to json_to_sheet is By Stage
    const byStageCallArgs = mockJsonToSheet.mock.calls[2]?.[0] as unknown[];

    expect(byStageCallArgs).toBeDefined();
    expect(byStageCallArgs).toHaveLength(mockSummary.ideaCountByStage.length);
  });

  it("Source sheet rows should match bySubmitterType length", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report");

    // Fourth call to json_to_sheet is Source
    const sourceCallArgs = mockJsonToSheet.mock.calls[3]?.[0] as unknown[];

    expect(sourceCallArgs).toBeDefined();
    expect(sourceCallArgs).toHaveLength(mockSourceAnalysis.bySubmitterType.length);
  });

  it("Ideas Detail rows should include expected columns", async () => {
    const { exportToExcel } = await import("@/modules/dashboard-analytics/export");
    exportToExcel(mockReportData, "pipeline-report");

    const ideasRows = mockJsonToSheet.mock.calls[1]?.[0] as Array<Record<string, unknown>>;

    expect(ideasRows?.[0]).toMatchObject({
      "Reference Number": "REF-001",
      Title: "First Idea",
      "Submitter Type": SubmitterType.EMPLOYEE,
      "Current Stage": IdeaStage.SANDBOX,
    });
  });
});

// ─── triggerPrintPDF ──────────────────────────────────────────────────────────

describe("triggerPrintPDF()", () => {
  let originalWindowPrint: typeof window.print;

  beforeEach(() => {
    originalWindowPrint = window.print;
    window.print = vi.fn();
  });

  afterEach(() => {
    window.print = originalWindowPrint;
    vi.clearAllMocks();
  });

  it("should call window.print() once", async () => {
    const { triggerPrintPDF } = await import("@/modules/dashboard-analytics/export");
    triggerPrintPDF();

    expect(window.print).toHaveBeenCalledOnce();
  });

  it("should not throw in non-browser environment (window undefined guard)", async () => {
    // Temporarily remove window to simulate SSR
    const win = global.window;
    // @ts-expect-error — intentional for SSR test
    delete global.window;

    const { triggerPrintPDF } = await import("@/modules/dashboard-analytics/export");
    expect(() => triggerPrintPDF()).not.toThrow();

    // Restore
    global.window = win;
  });
});
