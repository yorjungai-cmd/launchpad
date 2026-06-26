"use client";

/**
 * InputTypeTabs — switches between text / file / url input methods.
 *
 * Wraps shadcn/ui Tabs. Exposes controlled value + onChange for use inside
 * SubmissionForm, and renders slot children per tab panel.
 *
 * Task 4.4
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type InputType = "text" | "file" | "url";

export interface InputTypeTabsProps {
  value: InputType;
  onChange: (v: InputType) => void;
  /** Content to render inside the "text" tab panel */
  textContent?: React.ReactNode;
  /** Content to render inside the "file" tab panel */
  fileContent?: React.ReactNode;
  /** Content to render inside the "url" tab panel */
  urlContent?: React.ReactNode;
}

export function InputTypeTabs({
  value,
  onChange,
  textContent,
  fileContent,
  urlContent,
}: InputTypeTabsProps) {
  const t = useTranslations("submission.inputType");

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as InputType)} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="text" className="flex-1">
          {t("text")}
        </TabsTrigger>
        <TabsTrigger value="file" className="flex-1">
          {t("file")}
        </TabsTrigger>
        <TabsTrigger value="url" className="flex-1">
          {t("url")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="mt-4">
        {textContent}
      </TabsContent>

      <TabsContent value="file" className="mt-4">
        {fileContent}
      </TabsContent>

      <TabsContent value="url" className="mt-4">
        {urlContent}
      </TabsContent>
    </Tabs>
  );
}
