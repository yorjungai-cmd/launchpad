# Supabase Migrations

## Naming Convention

```
{timestamp}_{description}.sql
```

- **timestamp**: `YYYYMMDDHHmmss` (UTC) — guarantees chronological ordering
- **description**: snake_case, short, descriptive (e.g., `profiles`, `add_idea_stage_index`)
- Example: `20260625000001_profiles.sql`

## Ordering

Migrations run in alphabetical (timestamp) order. Always use the next sequential timestamp to avoid conflicts. Reserve `000000` through `000009` for foundation infrastructure.

| Range             | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `20260625000000`  | Foundation: extensions, trigger functions |
| `20260625000001`  | Foundation: profiles table + RLS          |
| `20260625000002`  | Foundation: storage buckets               |
| `20260625000100+` | Domain tables (ideas, submissions, etc.)  |

## Conventions

Every domain table **must** follow these conventions:

```sql
CREATE TABLE {table_name} (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... domain columns ...
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Always enable RLS on confidential tables
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Always apply the updated_at trigger (defined in 20260625000000_init.sql)
CREATE TRIGGER set_{table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## Rules

1. **Never modify existing migrations** — always create a new migration for changes
2. **RLS first** — enable RLS before inserting any data
3. **No raw SQL in application code** — all schema changes go through migrations
4. **snake_case** — table names (plural), column names
5. **Document policies** — add SQL comments explaining RLS policy intent

## Commands

```bash
# Apply migrations to local Supabase
pnpm supabase:migrate       # equivalent to: supabase db push

# Reset local DB and re-run all migrations + seed
pnpm supabase:reset

# Generate TypeScript types from current DB schema
pnpm supabase:types

# Start local Supabase stack
pnpm supabase:start

# Stop local Supabase stack
pnpm supabase:stop
```
