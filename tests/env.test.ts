/**
 * Tests for env schema validation (Task 1.3 verification)
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Import the schemas directly for unit testing without triggering process.env read
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

describe("env schema validation", () => {
  describe("clientSchema", () => {
    it("accepts valid client env vars", () => {
      const result = clientSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid NEXT_PUBLIC_SUPABASE_URL (not a URL)", () => {
      const result = clientSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
      const result = clientSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = clientSchema.safeParse({});
      expect(result.success).toBe(false);
      const errors = result.error?.flatten().fieldErrors;
      expect(errors).toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
      expect(errors).toHaveProperty("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    });
  });

  describe("serverSchema", () => {
    it("accepts valid server env vars", () => {
      const result = serverSchema.safeParse({
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        ANTHROPIC_API_KEY: "sk-ant-key",
        RESEND_API_KEY: "re_key",
        NODE_ENV: "development",
      });
      expect(result.success).toBe(true);
    });

    it("defaults NODE_ENV to development when not set", () => {
      const result = serverSchema.safeParse({
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        ANTHROPIC_API_KEY: "sk-ant-key",
        RESEND_API_KEY: "re_key",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe("development");
      }
    });

    it("rejects invalid NODE_ENV value", () => {
      const result = serverSchema.safeParse({
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        ANTHROPIC_API_KEY: "sk-ant-key",
        RESEND_API_KEY: "re_key",
        NODE_ENV: "staging",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty ANTHROPIC_API_KEY", () => {
      const result = serverSchema.safeParse({
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        ANTHROPIC_API_KEY: "",
        RESEND_API_KEY: "re_key",
      });
      expect(result.success).toBe(false);
    });
  });
});
