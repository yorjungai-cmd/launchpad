import { describe, it, expect } from "vitest";
import { SECTION_META } from "@/components/settings/prompt-config/DocTypeSectionEditor";
import { getTemplate } from "@/modules/document-generation/templates";
import type { DocumentType } from "@/modules/document-generation/types";

// project_proposal is composed from multiple templates — its SECTION_META keys
// don't map 1:1 to a single DocumentTemplate, so exclude it from sync checks.
const SKIP = new Set(["project_proposal"]);

describe("SECTION_META sync against document-templates", () => {
  const docTypes = Object.keys(SECTION_META).filter((t) => !SKIP.has(t));

  it("every documentType in SECTION_META has a matching template", () => {
    for (const docType of docTypes) {
      expect(
        getTemplate(docType as DocumentType),
        `no template found for SECTION_META key "${docType}"`
      ).toBeDefined();
    }
  });

  it("every section key in SECTION_META exists in its template", () => {
    for (const docType of docTypes) {
      const template = getTemplate(docType as DocumentType);
      if (!template) continue;
      const templateKeys = new Set(template.sections.map((s) => s.key));
      for (const { key } of SECTION_META[docType]!) {
        expect(
          templateKeys.has(key),
          `SECTION_META["${docType}"] key "${key}" not found in template`
        ).toBe(true);
      }
    }
  });

  it("every template section key appears in SECTION_META", () => {
    for (const docType of docTypes) {
      const template = getTemplate(docType as DocumentType);
      if (!template) continue;
      const metaKeys = new Set(SECTION_META[docType]!.map((s) => s.key));
      for (const { key } of template.sections) {
        expect(
          metaKeys.has(key),
          `template["${docType}"] section "${key}" missing from SECTION_META`
        ).toBe(true);
      }
    }
  });
});
