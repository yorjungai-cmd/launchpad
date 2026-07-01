import type { Product } from "@/modules/admin-ai-config/schemas";

export function formatPortfolioContext(products: Product[]): string {
  if (products.length === 0) {
    return "No portfolio products are currently configured.";
  }
  return products
    .map(
      (p) =>
        `**${p.name}** (ID: ${p.id})\n` +
        `Category: ${p.category}\n` +
        `Description: ${p.description}\n` +
        `Target Users: ${p.targetUsers}`
    )
    .join("\n\n");
}
