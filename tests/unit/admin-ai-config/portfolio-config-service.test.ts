import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: { log: mockAuditLog },
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

const queryChain = {
  select: mockSelect,
  limit: mockLimit,
  maybeSingle: mockMaybeSingle,
  single: mockSingle,
  update: mockUpdate,
  eq: mockEq,
};

mockSelect.mockReturnValue(queryChain);
mockLimit.mockReturnValue(queryChain);
mockUpdate.mockReturnValue(queryChain);
mockEq.mockReturnValue(queryChain);

const mockFrom = vi.fn().mockReturnValue(queryChain);
const mockAdminClient = { from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => mockAdminClient),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { PortfolioConfigService } from "@/modules/admin-ai-config/portfolio-config-service";
import type { Product } from "@/modules/admin-ai-config/schemas";

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: "PTCAD",
    name: "PTCAD AI",
    category: "CAD",
    description: "CAD software",
    targetUsers: "Engineers",
  },
  {
    id: "APP.AI",
    name: "APP.AI",
    category: "AI Platform",
    description: "AI platform",
    targetUsers: "Business users",
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PortfolioConfigService.getPortfolioConfig()", () => {
  let service: PortfolioConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(queryChain);
    mockLimit.mockReturnValue(queryChain);
    service = new PortfolioConfigService();
  });

  it("returns products from DB when row exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "row-1", portfolio_config: { products: SAMPLE_PRODUCTS } },
      error: null,
    });

    const result = await service.getPortfolioConfig();
    expect(result.products).toEqual(SAMPLE_PRODUCTS);
  });

  it("returns empty products when no DB row exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await service.getPortfolioConfig();
    expect(result.products).toEqual([]);
  });

  it("throws AppError.internal on DB error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(service.getPortfolioConfig()).rejects.toMatchObject({
      message: expect.stringContaining("Failed to read portfolio"),
    });
  });
});

describe("PortfolioConfigService.updatePortfolioConfig()", () => {
  let service: PortfolioConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(queryChain);
    mockLimit.mockReturnValue(queryChain);
    mockUpdate.mockReturnValue(queryChain);
    mockEq.mockReturnValue(queryChain);
    service = new PortfolioConfigService();
  });

  it("updates products and calls audit log", async () => {
    // First call: SELECT to get row id
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "row-1" }, error: null });
    // Second call: UPDATE result
    mockEq.mockResolvedValueOnce({ error: null });

    await service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid");

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portfolio_config_updated",
        adminId: "admin-uuid",
        targetType: "portfolio_config",
      })
    );
  });

  it("throws AppError.internal when no settings row found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid")
    ).rejects.toMatchObject({ message: expect.stringContaining("not found") });
  });

  it("throws AppError.internal on DB update error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "row-1" }, error: null });
    mockEq.mockResolvedValueOnce({ error: { message: "db error" } });

    await expect(
      service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid")
    ).rejects.toMatchObject({ message: expect.stringContaining("Failed to update") });
  });
});
