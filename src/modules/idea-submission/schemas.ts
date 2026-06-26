/**
 * Zod schemas for the idea-submission module.
 * Ref: design/api-spec.md — Zod Schemas
 *
 * Task 3.1
 */

import { z } from "zod";
import { emailSchema, referenceNumberSchema, paginationSchema } from "@/shared/schemas/common";

// ─── submitIdeaInput ──────────────────────────────────────────────────────────

export const submitIdeaInput = z
  .object({
    title: z.string().min(1).max(500),
    submitterName: z.string().min(1).max(255),
    submitterEmail: emailSchema,
    submitterType: z.enum(["employee", "executive", "partner", "vendor"]),
    inputType: z.enum(["text", "file", "url"]),
    rawContent: z.string().optional(),
    fileStoragePath: z.string().optional(),
    fileOriginalName: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    extractedText: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.inputType === "text") return !!d.rawContent;
      if (d.inputType === "file") return !!d.fileStoragePath;
      if (d.inputType === "url") return !!d.sourceUrl;
      return false;
    },
    { message: "Content required for selected input type" }
  );

export type SubmitIdeaInput = z.infer<typeof submitIdeaInput>;

// ─── extractFileInput ─────────────────────────────────────────────────────────

export const extractFileInput = z.object({
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
});

export type ExtractFileInput = z.infer<typeof extractFileInput>;

// ─── fetchUrlInput ────────────────────────────────────────────────────────────

export const fetchUrlInput = z.object({
  url: z.string().url(),
});

export type FetchUrlInput = z.infer<typeof fetchUrlInput>;

// ─── trackIdeaInput ───────────────────────────────────────────────────────────

export const trackIdeaInput = z.union([
  z.object({ ideaId: z.string().uuid() }),
  z.object({ referenceNumber: referenceNumberSchema, email: emailSchema }),
]);

export type TrackIdeaInput = z.infer<typeof trackIdeaInput>;

// ─── listMyIdeasInput ─────────────────────────────────────────────────────────

export const listMyIdeasInput = paginationSchema;

export type ListMyIdeasInput = z.infer<typeof listMyIdeasInput>;
