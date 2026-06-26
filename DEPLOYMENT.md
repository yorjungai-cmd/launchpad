# Deployment Guide — LaunchPad Portal

## Overview

| Item            | Value                                  |
| --------------- | -------------------------------------- |
| Platform        | Vercel (Next.js serverless)            |
| Database        | Supabase (PostgreSQL)                  |
| CI/CD           | GitHub Actions                         |
| Branch strategy | GitHub Flow (`main` = production)      |
| Environments    | Preview (per-PR) + Production (`main`) |
| Rollback        | Vercel instant rollback via dashboard  |

---

## Prerequisites

1. **Vercel account** — [vercel.com](https://vercel.com) + project linked to this repo
2. **Supabase project** — [supabase.com](https://supabase.com) + production database created
3. **GitHub repository** — with Actions enabled
4. **Resend account** — [resend.com](https://resend.com) for email notifications
5. **Sentry project** — [sentry.io](https://sentry.io) for error tracking (optional but recommended)

---

## First-Time Setup

### 1. Supabase — Run Migrations

```bash
# Link your local project to the Supabase remote
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations to production
supabase db push

# Verify migrations applied
supabase db diff
```

### 2. Vercel — Link Project

```bash
# Install Vercel CLI
pnpm add -g vercel

# Link project (generates .vercel/project.json)
vercel link

# Set environment variables for Production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add RESEND_API_KEY production
vercel env add RESEND_FROM_EMAIL production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

### 3. GitHub Secrets — Configure CI/CD

Go to: **Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret name         | Where to get it                                                |
| ------------------- | -------------------------------------------------------------- |
| `VERCEL_TOKEN`      | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID`     | `.vercel/project.json` after `vercel link`                     |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link`                     |

---

## CI/CD Pipeline

```
Push / PR
    │
    ├── typecheck (tsc --noEmit)
    ├── lint (next lint)
    └── test (vitest run — 777 tests)
              │
              └── All pass → deploy
                      │
                      ├── PR → Preview URL (auto-comment on PR)
                      └── main → Production (Vercel atomic deploy)
```

**Pipeline file**: `.github/workflows/ci.yml`

### Deployment Environments

| Environment | Trigger        | URL pattern                                      |
| ----------- | -------------- | ------------------------------------------------ |
| Preview     | Pull request   | `launchpad-portal-git-{branch}-{org}.vercel.app` |
| Production  | Push to `main` | Your custom domain                               |

---

## Rollback

**Instant rollback** (recommended):

1. Open [vercel.com](https://vercel.com) → Project → Deployments
2. Find the last good deployment
3. Click ⋯ → **Promote to Production**

**Git-based rollback** (alternative):

```bash
git revert HEAD
git push origin main
# CI will run and redeploy the reverted version
```

---

## Supabase Vault (API Keys)

Claude API keys are managed through the **Admin Settings UI** (`/settings?tab=api-keys`) and stored encrypted in Supabase Vault — NOT in environment variables.

After first deployment:

1. Login as Admin
2. Go to `/settings?tab=api-keys`
3. Add your Claude API key and click "Test" then "Save"

---

## Environment Variables Reference

See `.env.example` for the complete list with descriptions.

**Required for production**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

**Optional**:

- `NEXT_PUBLIC_SENTRY_DSN` (error tracking)
- `SENTRY_ORG`, `SENTRY_PROJECT` (Sentry source maps)

---

## Health Check

After deployment, verify:

```bash
# Check the health endpoint
curl https://your-domain.com/api/health

# Expected: {"status":"ok","timestamp":"..."}
```

---

## Local Development

```bash
# 1. Copy env template
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 2. Start Supabase local
pnpm supabase:start

# 3. Run migrations
pnpm supabase:reset

# 4. Start dev server
pnpm dev
```
