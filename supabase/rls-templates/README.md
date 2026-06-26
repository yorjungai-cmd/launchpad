# RLS Policy Templates

Row-Level Security (RLS) policy patterns used across all tables in the LaunchPad Portal.
Every confidential table **must** have RLS enabled and use one or more of the patterns below.

---

## Patterns

### 1. Self-Access

User can read and update their own row. Identified by matching `auth.uid()` to the row's user identifier column.

**Use case**: `profiles` table — users manage their own profile.

```sql
-- SELECT: user reads own row
CREATE POLICY "{table}: self read"
  ON {table} FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: user updates own row
CREATE POLICY "{table}: self update"
  ON {table} FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### 2. Role-Based (bd_reviewer / admin reads all rows)

Privileged roles can access all rows. Role is stored in the `profiles` table and looked up via a security-definer function to avoid recursive RLS.

**Use case**: `ideas`, `ai_analysis`, etc. — BD Reviewer and Admin need full visibility.

```sql
-- Helper function (create once, used by all role-based policies)
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
```

---

### 3. Guest Access via `reference_number`

Unauthenticated guests can access a specific row by presenting the row's `reference_number`.
The reference number is passed as a Postgres session variable (`app.reference_number`) set by
the server-side API before executing the query.

**Use case**: External submitters tracking their idea status without logging in.

```sql
CREATE POLICY "{table}: guest access via reference_number"
  ON {table} FOR SELECT
  USING (
    reference_number = current_setting('app.reference_number', true)
  );
```

> **Security note**: The calling server code must validate the reference number format
> (`/^LP-[A-Z0-9]{8}$/`) before passing it to `set_config`. Never expose this pattern over
> a public endpoint without that validation.

---

### 4. Service Role Bypass

The Supabase `service_role` key is granted `BYPASSRLS` at the PostgreSQL level — it always
skips all RLS policies. Use it exclusively in:

- Server-side seed scripts (`scripts/seed.ts`)
- Supabase migrations
- Background jobs / Edge Functions that run with elevated privilege

**No SQL needed** — this is handled automatically by the `service_role` key. Do **not** use
the service key in browser-side code or client-facing API routes.

---

## Combining Patterns

Multiple policies on the same table are combined with `OR` for the same operation.

Example for the `ideas` table:

1. Self-access → submitter reads/updates own idea
2. Role-based → bd_reviewer/admin reads all ideas
3. Guest → unauthenticated user reads idea via reference number

```sql
-- ideas: submitter reads own idea
CREATE POLICY "ideas: submitter self read"
  ON ideas FOR SELECT
  TO authenticated
  USING (submitter_id = auth.uid());

-- ideas: role read (bd_reviewer/admin)
CREATE POLICY "ideas: role read (bd_reviewer/admin)"
  ON ideas FOR SELECT
  TO authenticated
  USING (auth.user_role() IN ('bd_reviewer', 'admin'));

-- ideas: guest access via reference_number
CREATE POLICY "ideas: guest access via reference_number"
  ON ideas FOR SELECT
  USING (reference_number = current_setting('app.reference_number', true));
```

---

## Checklist

Before creating a new table:

- [ ] `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;`
- [ ] `ALTER TABLE {table} FORCE ROW LEVEL SECURITY;` (ensures service_role policies are explicit)
- [ ] At least one SELECT policy
- [ ] INSERT / UPDATE / DELETE policies as appropriate
- [ ] Add the table to the RLS integration test suite (`tests/lib/supabase/`)
