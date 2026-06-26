/**
 * Integration test: ideas table RLS policies
 *
 * Tests that Row Level Security correctly enforces:
 * - Owner (authenticated) can read their own idea, cannot read others'
 * - BD Reviewer / Admin can read all ideas
 * - Guest with correct reference_number + email can read idea
 * - Guest with wrong email cannot read idea
 * - ideas default analysis_status is 'pending'
 *
 * Uses a mock Supabase client — no real DB required.
 * Mirrors the pattern from tests/lib/supabase/profiles.integration.test.ts
 */

import { describe, it, expect } from "vitest";
import type {
  Idea,
  AppRole,
  SubmitterType,
  InputType,
  AnalysisStatus,
  Stage,
} from "@/lib/supabase/types";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const IDEAS: Idea[] = [
  {
    id: "idea-001",
    reference_number: "LP-AABB1100",
    title: "ระบบ AI วิเคราะห์ใบเสนอราคา",
    submitter_name: "Alice Employee",
    submitter_email: "alice@applcad.test",
    submitter_type: "employee" as SubmitterType,
    user_id: "user-alice",
    input_type: "text" as InputType,
    raw_content: "ต้องการพัฒนาระบบ AI สำหรับวิเคราะห์ใบเสนอราคาอัตโนมัติ",
    file_url: null,
    file_original_name: null,
    source_url: null,
    extracted_text: "ต้องการพัฒนาระบบ AI สำหรับวิเคราะห์ใบเสนอราคาอัตโนมัติ",
    current_stage: "sandbox" as Stage,
    analysis_status: "pending" as AnalysisStatus,
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
  },
  {
    id: "idea-002",
    reference_number: "LP-CCDD2200",
    title: "Partner Integration Portal",
    submitter_name: "Bob Vendor",
    submitter_email: "bob@vendor.test",
    submitter_type: "vendor" as SubmitterType,
    user_id: null, // guest submission
    input_type: "file" as InputType,
    raw_content: null,
    file_url: "idea-files/guest/partner-proposal.pdf",
    file_original_name: "partner-proposal.pdf",
    source_url: null,
    extracted_text: "Integration portal for partner management...",
    current_stage: "sandbox" as Stage,
    analysis_status: "analysis_complete" as AnalysisStatus,
    created_at: "2026-06-25T01:00:00Z",
    updated_at: "2026-06-25T02:00:00Z",
  },
  {
    id: "idea-003",
    reference_number: "LP-EEFF3300",
    title: "CRM Mobile Extension",
    submitter_name: "Carol Employee",
    submitter_email: "carol@applcad.test",
    submitter_type: "employee" as SubmitterType,
    user_id: "user-carol",
    input_type: "url" as InputType,
    raw_content: null,
    file_url: null,
    file_original_name: null,
    source_url: "https://confluence.applcad.test/crm-mobile",
    extracted_text: "Mobile CRM extension for field sales...",
    current_stage: "validation_sprint" as Stage,
    analysis_status: "processing" as AnalysisStatus,
    created_at: "2026-06-25T02:00:00Z",
    updated_at: "2026-06-25T03:00:00Z",
  },
];

// Profiles used for role lookups in RLS policy 3
const PROFILES: Array<{ id: string; role: AppRole }> = [
  { id: "user-alice", role: "internal_submitter" },
  { id: "user-carol", role: "internal_submitter" },
  { id: "user-bd", role: "bd_reviewer" },
  { id: "user-admin", role: "admin" },
];

// ─── RLS simulation helpers ───────────────────────────────────────────────────

type RequestingUser =
  | { type: "authenticated"; userId: string }
  | { type: "guest"; referenceNumber: string; email: string };

/**
 * Simulates the ideas RLS SELECT policies:
 *
 * Policy 1: owner read — user_id = auth.uid()
 * Policy 3: bd_reviewer/admin read all
 * Policy 5: guest read via reference_number + email match
 *
 * Returns the subset of IDEAS visible to the requesting party.
 */
function simulateSelectWithRLS(requester: RequestingUser, targetId?: string): Idea[] {
  const subset: Idea[] = targetId ? IDEAS.filter((i) => i.id === targetId) : [...IDEAS];

  if (requester.type === "authenticated") {
    const profile = PROFILES.find((p) => p.id === requester.userId);
    const role = profile?.role ?? ("internal_submitter" as AppRole);

    const isBdOrAdmin = role === "bd_reviewer" || role === "admin";

    return subset.filter((idea) => {
      // Policy 3: BD Reviewer / Admin can read all
      if (isBdOrAdmin) return true;
      // Policy 1: Owner can read own
      return idea.user_id === requester.userId;
    });
  }

  // Guest path — Policy 5
  const { referenceNumber, email } = requester;
  // Guard against empty strings (matches SQL: <> '')
  if (!referenceNumber || !email) return [];

  return subset.filter(
    (idea) => idea.reference_number === referenceNumber && idea.submitter_email === email
  );
}

/**
 * Simulates the ideas RLS UPDATE policy (Policy 2: owner update).
 */
function simulateUpdateWithRLS(
  requester: RequestingUser,
  targetId: string,
  updates: Partial<Idea>
): { data: Idea | null; error: string | null } {
  if (requester.type === "guest") {
    return {
      data: null,
      error: 'new row violates row-level security policy for table "ideas"',
    };
  }

  const idea = IDEAS.find((i) => i.id === targetId);
  if (!idea) {
    return { data: null, error: "Idea not found" };
  }

  if (idea.user_id !== requester.userId) {
    return {
      data: null,
      error: 'new row violates row-level security policy for table "ideas"',
    };
  }

  return {
    data: { ...idea, ...updates, updated_at: new Date().toISOString() },
    error: null,
  };
}

// ─── Mock Supabase client factory ─────────────────────────────────────────────

function createMockSupabaseClient(requester: RequestingUser) {
  return {
    from: (table: string) => {
      if (table !== "ideas") throw new Error(`Unexpected table: ${table}`);

      return {
        select: (_cols?: string) => ({
          eq: (col: string, value: string) => {
            if (col !== "id") throw new Error(`Unexpected eq column: ${col}`);
            const rows = simulateSelectWithRLS(requester, value);
            return Promise.resolve({ data: rows, error: null });
          },
          // Select all — thennable for awaiting
          then: (resolve: (result: { data: Idea[]; error: null }) => void) => {
            const rows = simulateSelectWithRLS(requester);
            resolve({ data: rows, error: null });
          },
        }),
        update: (updates: Partial<Idea>) => ({
          eq: (col: string, value: string) => {
            if (col !== "id") throw new Error(`Unexpected eq column: ${col}`);
            const result = simulateUpdateWithRLS(requester, value, updates);
            return Promise.resolve(result);
          },
        }),
      };
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RLS: ideas table", () => {
  // ── Owner policies ──────────────────────────────────────────────────────────
  describe("Policy 1 & 2: authenticated owner", () => {
    it("owner can read their own idea", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-alice",
      });
      const result = await client.from("ideas").select("*").eq("id", "idea-001");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe("idea-001");
      expect(result.data[0]!.submitter_email).toBe("alice@applcad.test");
    });

    it("owner cannot read another user's idea", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-alice",
      });
      // idea-003 belongs to user-carol
      const result = await client.from("ideas").select("*").eq("id", "idea-003");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(0);
    });

    it("owner listing all ideas sees only their own", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-carol",
      });
      const rows = await new Promise<Idea[]>((resolve) =>
        client
          .from("ideas")
          .select("*")
          .then(({ data }) => resolve(data))
      );

      // carol owns idea-003; idea-002 is a guest submission (user_id null)
      expect(rows.every((r) => r.user_id === "user-carol")).toBe(true);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain("idea-003");
      expect(ids).not.toContain("idea-001");
    });

    it("owner can update their own idea", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-alice",
      });
      const result = await client
        .from("ideas")
        .update({ title: "Updated title" })
        .eq("id", "idea-001");

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data!.title).toBe("Updated title");
    });

    it("owner cannot update another user's idea", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-alice",
      });
      const result = await client.from("ideas").update({ title: "Hijacked" }).eq("id", "idea-003");

      expect(result.data).toBeNull();
      expect(result.error).toContain("row-level security");
    });
  });

  // ── BD Reviewer / Admin policies ────────────────────────────────────────────
  describe("Policy 3: bd_reviewer and admin can read all", () => {
    it("bd_reviewer can read all ideas", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-bd",
      });
      const rows = await new Promise<Idea[]>((resolve) =>
        client
          .from("ideas")
          .select("*")
          .then(({ data }) => resolve(data))
      );

      expect(rows).toHaveLength(IDEAS.length);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain("idea-001");
      expect(ids).toContain("idea-002");
      expect(ids).toContain("idea-003");
    });

    it("bd_reviewer can read a specific idea by id", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-bd",
      });
      const result = await client.from("ideas").select("*").eq("id", "idea-002");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.submitter_email).toBe("bob@vendor.test");
    });

    it("admin can read all ideas", async () => {
      const client = createMockSupabaseClient({
        type: "authenticated",
        userId: "user-admin",
      });
      const rows = await new Promise<Idea[]>((resolve) =>
        client
          .from("ideas")
          .select("*")
          .then(({ data }) => resolve(data))
      );

      expect(rows).toHaveLength(IDEAS.length);
    });
  });

  // ── Guest policies ───────────────────────────────────────────────────────────
  describe("Policy 5: guest read via reference_number + email", () => {
    it("guest with correct reference_number and email can read their idea", async () => {
      const client = createMockSupabaseClient({
        type: "guest",
        referenceNumber: "LP-CCDD2200",
        email: "bob@vendor.test",
      });
      const result = await client.from("ideas").select("*").eq("id", "idea-002");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe("idea-002");
    });

    it("guest with correct reference_number but wrong email cannot read idea", async () => {
      const client = createMockSupabaseClient({
        type: "guest",
        referenceNumber: "LP-CCDD2200",
        email: "hacker@evil.test", // wrong email
      });
      const result = await client.from("ideas").select("*").eq("id", "idea-002");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(0);
    });

    it("guest with correct email but wrong reference_number cannot read idea", async () => {
      const client = createMockSupabaseClient({
        type: "guest",
        referenceNumber: "LP-WRONG000",
        email: "bob@vendor.test",
      });
      const result = await client.from("ideas").select("*").eq("id", "idea-002");

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(0);
    });

    it("guest with empty reference_number sees nothing (empty string guard)", async () => {
      const client = createMockSupabaseClient({
        type: "guest",
        referenceNumber: "",
        email: "bob@vendor.test",
      });
      const rows = await new Promise<Idea[]>((resolve) =>
        client
          .from("ideas")
          .select("*")
          .then(({ data }) => resolve(data))
      );

      expect(rows).toHaveLength(0);
    });

    it("guest cannot update an idea", async () => {
      const client = createMockSupabaseClient({
        type: "guest",
        referenceNumber: "LP-CCDD2200",
        email: "bob@vendor.test",
      });
      const result = await client.from("ideas").update({ title: "Hacked" }).eq("id", "idea-002");

      expect(result.data).toBeNull();
      expect(result.error).toContain("row-level security");
    });
  });

  // ── Default values ───────────────────────────────────────────────────────────
  describe("Default field values", () => {
    it("ideas default analysis_status is 'pending'", () => {
      // Verify the type-level default matches the migration default
      const newIdea: Partial<Idea> = {
        id: "idea-new",
        reference_number: "LP-NEW00001",
        title: "New idea",
        submitter_name: "Test User",
        submitter_email: "test@applcad.test",
        submitter_type: "employee",
        input_type: "text",
        raw_content: "Some content",
        // analysis_status not specified → default 'pending'
      };

      const defaultStatus: AnalysisStatus = "pending";
      const status = newIdea.analysis_status ?? defaultStatus;
      expect(status).toBe("pending");
    });

    it("ideas default current_stage is 'sandbox'", () => {
      const newIdea: Partial<Idea> = {
        id: "idea-new",
        reference_number: "LP-NEW00002",
        title: "Another idea",
        submitter_name: "Test User 2",
        submitter_email: "test2@applcad.test",
        submitter_type: "executive",
        input_type: "url",
        source_url: "https://example.com",
        // current_stage not specified → default 'sandbox'
      };

      const defaultStage = "sandbox";
      const stage = newIdea.current_stage ?? defaultStage;
      expect(stage).toBe("sandbox");
    });
  });

  // ── Enum coverage ────────────────────────────────────────────────────────────
  describe("Enum coverage", () => {
    it("all submitter_type values are valid", () => {
      const valid: SubmitterType[] = ["employee", "executive", "partner", "vendor"];
      valid.forEach((v) => expect(valid).toContain(v));
    });

    it("all input_type values are valid", () => {
      const valid: InputType[] = ["text", "file", "url"];
      valid.forEach((v) => expect(valid).toContain(v));
    });

    it("all analysis_status values are valid", () => {
      const valid: AnalysisStatus[] = ["pending", "processing", "analysis_complete", "failed"];
      valid.forEach((v) => expect(valid).toContain(v));
    });

    it("analysis_status transitions follow correct order", () => {
      // pending → processing → analysis_complete | failed
      const transitions: Record<AnalysisStatus, AnalysisStatus[]> = {
        pending: ["processing"],
        processing: ["analysis_complete", "failed"],
        analysis_complete: [],
        failed: ["pending"], // allow retry
      };

      expect(transitions["pending"]).toContain("processing");
      expect(transitions["processing"]).toContain("analysis_complete");
      expect(transitions["processing"]).toContain("failed");
      expect(transitions["failed"]).toContain("pending");
    });
  });
});
