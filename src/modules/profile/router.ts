/**
 * Profile module — tRPC router.
 *
 * Procedures:
 *   profile.me            — protectedProcedure → profile row from DB
 *   profile.updateLocale  — protectedProcedure → input: { locale: 'th' | 'en' }
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { AppError } from "@/lib/errors/AppError";

export const profileRouter = router({
  /**
   * Fetch the current user's profile row.
   * Throws UNAUTHORIZED if not authenticated (enforced by protectedProcedure).
   * Throws NOT_FOUND if no profile row exists.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from("profiles")
      .select("*")
      .eq("id", ctx.user.id)
      .single();

    if (error || !data) {
      if (error?.code === "PGRST116") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found.",
          cause: AppError.notFound("Profile not found."),
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch profile.",
        cause: AppError.internal(error?.message ?? "Unknown error"),
      });
    }

    return data;
  }),

  /**
   * Update the preferred locale for the current user.
   * Persists to the `profiles` table and returns the updated row.
   */
  updateLocale: protectedProcedure
    .input(
      z.object({
        locale: z.enum(["th", "en"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from("profiles")
        .update({ locale: input.locale })
        .eq("id", ctx.user.id)
        .select()
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update locale.",
          cause: AppError.internal(error?.message ?? "Unknown error"),
        });
      }

      return data;
    }),
});
