"use client";

/**
 * TrackView — guest idea tracking with email gate.
 *
 * 1. Shows email input form
 * 2. On submit: queries api.idea.getStatus with referenceNumber + email
 * 3. Shows status card: stage, analysisStatus, createdAt, referenceNumber
 *
 * Task 5.3
 */

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GuidedField } from "./GuidedField";
import { AlertCircle, Clock, CheckCircle } from "lucide-react";

interface TrackViewProps {
  referenceNumber: string;
}

export function TrackView({ referenceNumber }: TrackViewProps) {
  const t = useTranslations("track");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");

  const { data, isLoading, isError, error, refetch } = api.idea.getStatus.useQuery(
    { referenceNumber, email },
    {
      enabled: submitted && email.length > 0,
      retry: false,
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setEmailError(t("emailInvalid"));
      return;
    }
    setEmailError("");
    setSubmitted(true);
    void refetch();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Email gate form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="rounded-md border border-border bg-muted/50 px-4 py-2">
              <p className="text-xs text-muted-foreground">{t("referenceNumber")}</p>
              <p className="font-mono font-semibold">{referenceNumber}</p>
            </div>

            <GuidedField htmlFor="track-email" label={t("emailLabel")} required error={emailError}>
              <Input
                id="track-email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </GuidedField>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("checking") : t("checkStatus")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && submitted && (
        <div role="status" aria-live="polite">
          <Skeleton className="h-32 w-full" aria-label={t("checking")} />
        </div>
      )}

      {/* Error */}
      {isError && submitted && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>
            {error?.message?.includes("NOT_FOUND")
              ? t("notFound")
              : (error?.message ?? t("errorGeneric"))}
          </span>
        </div>
      )}

      {/* Status card */}
      {data && submitted && <StatusCard data={data} t={t} />}
    </div>
  );
}

// ─── Status Card ─────────────────────────────────────────────────────────────

interface StatusData {
  referenceNumber: string;
  analysisStatus: string;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
}

function StatusCard({ data, t }: { data: StatusData; t: ReturnType<typeof useTranslations> }) {
  const isComplete = data.analysisStatus === "analysis_complete";
  const isFailed = data.analysisStatus === "failed";

  return (
    <Card aria-live="polite" aria-atomic="true">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isComplete ? (
            <CheckCircle className="size-4 text-green-600" />
          ) : isFailed ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : (
            <Clock className="size-4 text-amber-500" />
          )}
          {t("statusTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("fields.referenceNumber")}</dt>
            <dd className="font-mono font-semibold">{data.referenceNumber}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("fields.stage")}</dt>
            <dd className="font-medium capitalize">{data.currentStage.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("fields.analysisStatus")}</dt>
            <dd
              className={
                isComplete
                  ? "font-medium text-green-700"
                  : isFailed
                    ? "font-medium text-destructive"
                    : "font-medium text-amber-600"
              }
            >
              {isComplete
                ? t("status.complete")
                : isFailed
                  ? t("status.failed")
                  : t("status.pending")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("fields.createdAt")}</dt>
            <dd>
              {new Date(data.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
