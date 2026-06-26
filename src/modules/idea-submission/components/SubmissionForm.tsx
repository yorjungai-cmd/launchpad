"use client";

/**
 * SubmissionForm — main idea submission form.
 *
 * - React Hook Form + zodResolver(submitIdeaInput)
 * - Fields: title, submitterName, submitterEmail, submitterType, inputType + content
 * - Guest: submitterEmail required (editable)
 * - Internal (from useUser()): pre-fill email from session, read-only
 * - On submit: api.idea.submit.mutate() → navigate to /[locale]/(app)/ideas/[id]
 * - Accessible: required fields marked, errors inline, keyboard navigable
 *
 * Task 4.5
 */

import * as React from "react";
import { useCallback, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { useUser } from "@/lib/auth/hooks";
import { submitIdeaInput, type SubmitIdeaInput } from "@/modules/idea-submission/schemas";
import { GuidedField } from "./GuidedField";
import { SubmitterTypeSelect } from "./SubmitterTypeSelect";
import { InputTypeTabs, type InputType } from "./InputTypeTabs";
import { FileUploadHandler } from "./FileUploadHandler";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Component ────────────────────────────────────────────────────────────────

export function SubmissionForm() {
  const t = useTranslations("submission");
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "th";
  const user = useUser();

  const [inputType, setInputType] = useState<InputType>("text");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitIdeaInput>({
    resolver: zodResolver(submitIdeaInput),
    defaultValues: {
      inputType: "text",
      submitterEmail: user?.email ?? "",
      submitterName: user?.fullName ?? "",
      submitterType: undefined,
    },
  });

  // Keep inputType field in sync with tab state
  React.useEffect(() => {
    setValue("inputType", inputType);
    // Reset content fields on tab change
    setValue("rawContent", undefined);
    setValue("fileStoragePath", undefined);
    setValue("fileOriginalName", undefined);
    setValue("sourceUrl", undefined);
    setValue("extractedText", undefined);
  }, [inputType, setValue]);

  const submitMutation = api.idea.submit.useMutation({
    onSuccess: (data) => {
      router.push(`/${locale}/ideas/${data.ideaId}`);
    },
    onError: (err) => {
      setSubmitError(err.message);
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setSubmitError(null);
    await submitMutation.mutateAsync(data);
  });

  // ─── File extraction callback ───────────────────────────────────────────

  const handleExtracted = useCallback(
    (text: string, storagePath: string, originalName: string) => {
      setValue("extractedText", text);
      setValue("fileStoragePath", storagePath);
      setValue("fileOriginalName", originalName);
    },
    [setValue]
  );

  // ─── URL fetch callback ─────────────────────────────────────────────────

  const fetchUrlMutation = api.idea.fetchUrl.useMutation({
    onSuccess: (data) => {
      setValue("extractedText", data.extractedText);
    },
  });

  const handleFetchUrl = useCallback(() => {
    const url = watch("sourceUrl");
    if (url) {
      void fetchUrlMutation.mutateAsync({ url });
    }
  }, [watch, fetchUrlMutation]);

  const isLoading = isSubmitting || submitMutation.isPending;

  // ─── Tab content ─────────────────────────────────────────────────────────

  const textContent = (
    <GuidedField
      htmlFor="rawContent"
      label={t("fields.description")}
      required
      tooltip={t("tooltips.description")}
      error={errors.rawContent?.message}
    >
      <Textarea
        id="rawContent"
        rows={6}
        placeholder={t("placeholders.description")}
        {...register("rawContent")}
        className={cn(errors.rawContent && "border-destructive")}
      />
    </GuidedField>
  );

  const fileContent = (
    <FileUploadHandler onExtracted={handleExtracted} onError={(msg) => setSubmitError(msg)} />
  );

  const urlContent = (
    <div className="flex flex-col gap-3">
      <GuidedField
        htmlFor="sourceUrl"
        label={t("fields.sourceUrl")}
        required
        tooltip={t("tooltips.sourceUrl")}
        error={errors.sourceUrl?.message}
      >
        <div className="flex gap-2">
          <Input
            id="sourceUrl"
            type="url"
            placeholder={t("placeholders.sourceUrl")}
            {...register("sourceUrl")}
            className={cn("flex-1", errors.sourceUrl && "border-destructive")}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleFetchUrl}
            disabled={fetchUrlMutation.isPending}
          >
            {fetchUrlMutation.isPending ? t("buttons.fetching") : t("buttons.fetchUrl")}
          </Button>
        </div>
      </GuidedField>

      {fetchUrlMutation.data && (
        <div className="rounded-md border border-border bg-muted/50 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("fields.extractedPreview")}
          </p>
          <Textarea
            rows={5}
            readOnly
            value={fetchUrlMutation.data.extractedText}
            className="resize-none font-mono text-xs"
            aria-label={t("fields.extractedPreview")}
          />
        </div>
      )}

      {fetchUrlMutation.isError && (
        <p className="text-sm text-destructive">{fetchUrlMutation.error.message}</p>
      )}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("formLabel")}
      className="flex flex-col gap-6"
    >
      {/* Title */}
      <GuidedField
        htmlFor="title"
        label={t("fields.title")}
        required
        tooltip={t("tooltips.title")}
        error={errors.title?.message}
      >
        <Input
          id="title"
          placeholder={t("placeholders.title")}
          {...register("title")}
          className={cn(errors.title && "border-destructive")}
        />
      </GuidedField>

      {/* Submitter Name */}
      <GuidedField
        htmlFor="submitterName"
        label={t("fields.submitterName")}
        required
        tooltip={t("tooltips.submitterName")}
        error={errors.submitterName?.message}
      >
        <Input
          id="submitterName"
          placeholder={t("placeholders.submitterName")}
          {...register("submitterName")}
          className={cn(errors.submitterName && "border-destructive")}
        />
      </GuidedField>

      {/* Submitter Email — always editable, pre-filled from session if logged in */}
      <GuidedField
        htmlFor="submitterEmail"
        label={t("fields.submitterEmail")}
        required
        tooltip={t("tooltips.submitterEmailGuest")}
        error={errors.submitterEmail?.message}
      >
        <Input
          id="submitterEmail"
          type="email"
          placeholder={t("placeholders.submitterEmail")}
          {...register("submitterEmail")}
          className={cn(errors.submitterEmail && "border-destructive")}
        />
      </GuidedField>

      {/* Submitter Type */}
      <GuidedField
        htmlFor="submitterType"
        label={t("fields.submitterType")}
        required
        tooltip={t("tooltips.submitterType")}
        error={errors.submitterType?.message}
      >
        <Controller
          name="submitterType"
          control={control}
          render={({ field }) => (
            <SubmitterTypeSelect
              id="submitterType"
              value={field.value}
              onChange={field.onChange}
              required
              aria-describedby={errors.submitterType ? "submitterType-error" : undefined}
              aria-invalid={!!errors.submitterType}
            />
          )}
        />
      </GuidedField>

      {/* Input type tabs + content */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          {t("fields.inputType")}
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        </p>
        <InputTypeTabs
          value={inputType}
          onChange={setInputType}
          textContent={textContent}
          fileContent={fileContent}
          urlContent={urlContent}
        />
        {/* Content validation errors */}
        {(errors.rawContent || errors.fileStoragePath || errors.sourceUrl) &&
          inputType === "text" && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {errors.rawContent?.message}
            </p>
          )}
      </div>

      {/* Global submit error */}
      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      {/* Submit */}
      <Button type="submit" disabled={isLoading} className="w-full" aria-busy={isLoading}>
        {isLoading ? t("buttons.submitting") : t("buttons.submit")}
      </Button>
    </form>
  );
}
