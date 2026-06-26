"use client";

/**
 * SubmitterTypeSelect — dropdown for selecting submitter type.
 *
 * Options: employee | executive | partner | vendor
 * i18n labels from submission.submitterType.*
 * Accessible: aria-label, required indicator.
 *
 * Task 4.1
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SubmitterType = "employee" | "executive" | "partner" | "vendor";

interface SubmitterTypeSelectProps {
  value?: SubmitterType;
  onChange: (value: SubmitterType) => void;
  id?: string;
  /** Marks field as required — adds visual indicator */
  required?: boolean;
  disabled?: boolean;
  /** aria-label override — defaults to translation key */
  "aria-label"?: string;
  /** aria-describedby for linked error or hint */
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

const TYPES: SubmitterType[] = ["employee", "executive", "partner", "vendor"];

export function SubmitterTypeSelect({
  value,
  onChange,
  id,
  required,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
}: SubmitterTypeSelectProps) {
  const t = useTranslations("submission.submitterType");

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as SubmitterType)}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel ?? t("label")}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired ?? required}
        aria-invalid={ariaInvalid}
        className="w-full"
      >
        <SelectValue placeholder={t("placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {t(type)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
