import { describe, it, expect } from "vitest";
import { ProductSchema, UpdatePortfolioConfigSchema } from "@/modules/admin-ai-config/schemas";

describe("ProductSchema", () => {
  it("accepts a valid product", () => {
    const result = ProductSchema.safeParse({
      id: "PTCAD",
      name: "PTCAD AI",
      category: "CAD",
      description: "A CAD tool",
      targetUsers: "Engineers",
    });
    expect(result.success).toBe(true);
  });

  it("rejects id with spaces", () => {
    const result = ProductSchema.safeParse({
      id: "MY PRODUCT",
      name: "My Product",
      category: "Cat",
      description: "desc",
      targetUsers: "users",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/spaces/i);
  });

  it("rejects empty id", () => {
    const result = ProductSchema.safeParse({
      id: "",
      name: "X",
      category: "C",
      description: "d",
      targetUsers: "u",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdatePortfolioConfigSchema", () => {
  const validProduct = {
    id: "PTCAD",
    name: "PTCAD AI",
    category: "CAD",
    description: "A CAD tool",
    targetUsers: "Engineers",
  };

  it("accepts an empty products array", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({ products: [] });
    expect(result.success).toBe(true);
  });

  it("accepts an array of valid products", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({
      products: [validProduct, { ...validProduct, id: "APP.AI", name: "APP.AI" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({
      products: [validProduct, validProduct],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/unique/i);
  });
});
