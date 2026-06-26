-- ============================================================
-- Migration: 20260625000301_output_documents_table.sql
-- Description: document-generation unit — output_documents table, indexes, RLS
-- Depends on:
--   20260625000000_init.sql (set_updated_at, gen_random_uuid)
--   20260625000001_profiles.sql (profiles, app_role)
--   20260625000100_ideas.sql (ideas)
--   20260625000201_ai_analyses_table.sql (ai_analyses)
--   20260625000300_document_generation_enums.sql
-- ============================================================

CREATE TABLE output_documents (
  id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id               uuid              NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  analysis_id           uuid              NOT NULL REFERENCES ai_analyses(id) ON DELETE CASCADE,
  document_type         document_type     NOT NULL,
  stage_snapshot        launch_pad_stage  NOT NULL,
  title                 text              NOT NULL,
  content_markdown      text,
  content_edited_markdown text,
  sections              jsonb,
  watermark_status      watermark_status  NOT NULL DEFAULT 'ai_draft',
  generation_status     doc_generation_status NOT NULL DEFAULT 'pending',
  last_error            text,
  generated_at          timestamptz,
  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now()
);

-- Unique constraint: 1 document per type per idea
CREATE UNIQUE INDEX idx_output_documents_idea_type
  ON output_documents (idea_id, document_type);

CREATE INDEX idx_output_documents_idea_id
  ON output_documents (idea_id);

CREATE INDEX idx_output_documents_gen_status
  ON output_documents (generation_status);

CREATE INDEX idx_output_documents_watermark
  ON output_documents (watermark_status);

-- updated_at trigger
CREATE TRIGGER set_output_documents_updated_at
  BEFORE UPDATE ON output_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE output_documents ENABLE ROW LEVEL SECURITY;

-- Submitter reads own idea's documents
CREATE POLICY "output_documents: submitter can read own"
  ON output_documents FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ideas
      WHERE ideas.id = output_documents.idea_id
        AND ideas.user_id = auth.uid()
    )
  );

-- BD Reviewer / Admin read all
CREATE POLICY "output_documents: bd_reviewer and admin can select all"
  ON output_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- BD Reviewer / Admin update (edit content, watermark)
CREATE POLICY "output_documents: bd_reviewer and admin can update"
  ON output_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Service role full access (worker)
CREATE POLICY "output_documents: service role full access"
  ON output_documents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
