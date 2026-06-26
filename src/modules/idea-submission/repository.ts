/**
 * IdeaRepository — data access layer for the `ideas` table.
 * Ref: design/components.md — IdeaRepository
 *
 * Task 3.2
 */

import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Idea, IdeaInsert, AnalysisStatus } from "@/lib/supabase/types";
import { generateReferenceNumber } from "@/lib/auth/reference-number";
import { AppError } from "@/lib/errors/AppError";
import type { PaginationInput } from "@/shared/schemas/common";

// Supabase Postgres error code for unique_violation
const PG_UNIQUE_VIOLATION = "23505";
const MAX_RETRY = 3;

export class IdeaRepository {
  /**
   * Insert a new idea row.
   * Generates a reference_number server-side.
   * Retries up to MAX_RETRY times on unique_violation (reference_number conflict).
   */
  async createIdea(
    data: Omit<IdeaInsert, "reference_number">,
    db: SupabaseClient<Database>
  ): Promise<Idea> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const referenceNumber = generateReferenceNumber();
      const insertData: IdeaInsert = {
        ...data,
        reference_number: referenceNumber,
      };

      const { data: row, error } = await db.from("ideas").insert(insertData).select().single();

      if (error) {
        // Retry on unique violation (reference_number collision)
        if (error.code === PG_UNIQUE_VIOLATION) {
          lastError = error;
          continue;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create idea.",
          cause: AppError.internal(error.message),
        });
      }

      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create idea: no row returned.",
          cause: AppError.internal("No row returned after insert"),
        });
      }

      return row;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate unique reference number after retries.",
      cause: AppError.internal(
        `Reference number collision after ${MAX_RETRY} attempts. Last error: ${String(lastError)}`
      ),
    });
  }

  /**
   * Fetch a single idea by its UUID.
   * Returns null when not found or not accessible (RLS will hide rows).
   */
  async getIdeaById(id: string, db: SupabaseClient<Database>): Promise<Idea | null> {
    const { data, error } = await db.from("ideas").select("*").eq("id", id).single();

    if (error) {
      // PGRST116 = no rows returned (PostgREST)
      if (error.code === "PGRST116") return null;
      return null;
    }

    return data ?? null;
  }

  /**
   * Fetch a single idea by reference_number + submitter_email.
   * Used for guest tracking. RLS enforces further access control.
   */
  async getIdeaByRefNum(
    refNum: string,
    email: string,
    db: SupabaseClient<Database>
  ): Promise<Idea | null> {
    const { data, error } = await db
      .from("ideas")
      .select("*")
      .eq("reference_number", refNum)
      .eq("submitter_email", email)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      return null;
    }

    return data ?? null;
  }

  /**
   * List ideas submitted by a specific user (cursor-based pagination).
   */
  async listIdeasByUser(
    userId: string,
    db: SupabaseClient<Database>,
    opts: PaginationInput
  ): Promise<{ items: Idea[]; nextCursor?: string }> {
    const limit = opts.limit ?? 20;

    let query = db
      .from("ideas")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    if (opts.cursor) {
      // cursor is created_at of the last item — fetch rows older than cursor
      query = query.lt("created_at", opts.cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list ideas.",
        cause: AppError.internal(error.message),
      });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at : undefined;

    return { items, nextCursor };
  }

  /**
   * Update the analysis_status of an idea (called by AI pipeline).
   */
  async updateAnalysisStatus(
    id: string,
    status: AnalysisStatus,
    db: SupabaseClient<Database>
  ): Promise<void> {
    const { error } = await db.from("ideas").update({ analysis_status: status }).eq("id", id);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update analysis status.",
        cause: AppError.internal(error.message),
      });
    }
  }
}

/** Singleton — import this everywhere, do not instantiate directly */
export const ideaRepository = new IdeaRepository();
