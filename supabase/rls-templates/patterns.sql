-- =============================================================================
-- RLS Policy Templates — LaunchPad Portal
-- =============================================================================
-- Copy/adapt these SQL templates when creating RLS policies for new tables.
-- Replace {table} and column names to match the actual schema.
-- See README.md for full documentation of each pattern.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PATTERN 1: Self-Access
-- User reads/updates their own row (matched by user_id = auth.uid())
-- -----------------------------------------------------------------------------

-- SELECT: authenticated user reads own row
CREATE POLICY "{table}: self read"
  ON {table} FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: authenticated user updates own row
CREATE POLICY "{table}: self update"
  ON {table} FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT: authenticated user inserts own row
CREATE POLICY "{table}: self insert"
  ON {table} FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- PATTERN 2: Role-Based (bd_reviewer / admin reads all rows)
-- Requires the auth.user_role() helper function (defined below).
-- -----------------------------------------------------------------------------

-- Helper: fetch the calling user's role from the profiles table.
-- SECURITY DEFINER avoids infinite recursion when profiles itself has RLS.
CREATE OR REPLACE FUNCTION auth.user_role()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- SELECT: bd_reviewer or admin reads all rows
CREATE POLICY "{table}: role read (bd_reviewer/admin)"
  ON {table} FOR SELECT
  TO authenticated
  USING (auth.user_role() IN ('bd_reviewer', 'admin'));

-- UPDATE: admin updates any row
CREATE POLICY "{table}: admin update"
  ON {table} FOR UPDATE
  TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');


-- -----------------------------------------------------------------------------
-- PATTERN 3: Guest Access via reference_number
-- Unauthenticated access to a row via a reference number session variable.
-- The server must call:
--   SET LOCAL app.reference_number = '<value>';
-- before executing the query, after validating the format.
-- -----------------------------------------------------------------------------

CREATE POLICY "{table}: guest access via reference_number"
  ON {table} FOR SELECT
  USING (
    reference_number = current_setting('app.reference_number', true)
  );


-- -----------------------------------------------------------------------------
-- PATTERN 4: Service Role Bypass
-- The service_role key automatically bypasses RLS at the PostgreSQL level.
-- No policy SQL is required — this is a documentation-only pattern.
--
-- Usage: use the Supabase service_role client ONLY in:
--   - scripts/seed.ts
--   - supabase/migrations/*.sql
--   - Edge Functions / background jobs
--
-- NEVER expose the service_role key in client-side code.
-- -----------------------------------------------------------------------------

-- (No SQL — bypassed automatically by the service_role key)


-- -----------------------------------------------------------------------------
-- BOILERPLATE: Enable RLS on a new table
-- Always run both statements when creating a new table that holds confidential data.
-- -----------------------------------------------------------------------------

ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- EXAMPLE: Combining all 3 active patterns on the `ideas` table
-- (Self-access + Role-based + Guest reference-number)
-- -----------------------------------------------------------------------------

-- ideas: submitter reads own idea
CREATE POLICY "ideas: submitter self read"
  ON ideas FOR SELECT
  TO authenticated
  USING (submitter_id = auth.uid());

-- ideas: bd_reviewer or admin reads all ideas
CREATE POLICY "ideas: role read (bd_reviewer/admin)"
  ON ideas FOR SELECT
  TO authenticated
  USING (auth.user_role() IN ('bd_reviewer', 'admin'));

-- ideas: guest (unauthenticated) reads via reference_number
CREATE POLICY "ideas: guest access via reference_number"
  ON ideas FOR SELECT
  USING (
    reference_number = current_setting('app.reference_number', true)
  );
