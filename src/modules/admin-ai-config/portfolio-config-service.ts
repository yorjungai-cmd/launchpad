import { AppError } from "@/lib/errors/AppError";
import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import type { Product, PortfolioConfigData, UpdatePortfolioConfigInput } from "./schemas";

const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfigData = { products: [] };

interface SystemSettingsPortfolioRow {
  id: string;
  portfolio_config: { products: Product[] };
}

export class PortfolioConfigService {
  async getPortfolioConfig(): Promise<PortfolioConfigData> {
    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("system_settings")
      .select("id, portfolio_config")
      .limit(1)
      .maybeSingle<SystemSettingsPortfolioRow>();

    if (error) {
      logger.error({ err: error }, "PortfolioConfigService.getPortfolioConfig: DB SELECT error");
      throw AppError.internal("Failed to read portfolio configuration");
    }

    if (data === null) return DEFAULT_PORTFOLIO_CONFIG;

    return { products: data.portfolio_config?.products ?? [] };
  }

  async updatePortfolioConfig(
    input: UpdatePortfolioConfigInput,
    adminId: string
  ): Promise<PortfolioConfigData> {
    const db = createAdminSupabaseClient();

    const { data: existing, error: fetchErr } = await db
      .from("system_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "PortfolioConfigService.updatePortfolioConfig: SELECT error");
      throw AppError.internal("Failed to read settings for update");
    }

    if (existing === null) {
      throw AppError.internal("System settings row not found — run DB migration first");
    }

    const newConfig = { products: input.products };

    const { error: updateErr } = await db
      .from("system_settings")
      .update({ portfolio_config: newConfig, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateErr) {
      logger.error(
        { err: updateErr },
        "PortfolioConfigService.updatePortfolioConfig: UPDATE error"
      );
      throw AppError.internal("Failed to update portfolio configuration");
    }

    await adminAuditLogService.log({
      action: "portfolio_config_updated",
      adminId,
      targetType: "portfolio_config",
      targetId: existing.id,
      metadata: { product_count: String(input.products.length) },
    });

    return newConfig;
  }
}

export const portfolioConfigService = new PortfolioConfigService();
