# financial_tracking — CLAUDE.md

## What This Is
Personal finance tracker for Brazilian bank accounts. Import OFX statements, categorize transactions (manually or with AI), view charts. Optional Dexie Cloud sync for sharing data between two users.

## Tech Stack
- **React 19** + **TypeScript ~6** built with **Vite 8**
- **MUI v9** for UI components, **Tailwind CSS v4** for utilities
- **Dexie 4** (IndexedDB ORM) — all data is local-first
- **Dexie Cloud** (optional) — sync via `VITE_DEXIE_CLOUD_URL` env var
- **Recharts** for charts, **React Router v7** (HashRouter), **date-fns** for dates
- **Vitest** + **@testing-library/react** for tests

## Build & Run
```bash
npm run dev          # dev server
npm run build        # tsc + vite build
npm run test         # run tests (vitest run)
npm run test:watch   # watch mode
npm run type-check   # tsc --noEmit
npm run lint         # eslint
npm run deploy       # build + gh-pages deploy
```

## Project Structure
```
src/
├── db/               # Dexie setup, schema, migrations, cloud realm logic
├── features/         # One directory per feature — page + hook(s)
│   ├── dashboard/    # Charts: spending by category, cash flow, net worth
│   ├── transactions/ # List, filter, add, bulk-categorize
│   ├── import/       # OFX parsing + preview + confirm
│   ├── categories/   # Category CRUD + auto-rules
│   ├── suggestions/  # AI financial health + AI categorization
│   ├── matches/      # Detect offsetting transactions (PIX in/out)
│   ├── settings/     # AI config, cloud login, data export
│   └── auth/         # Cloud login/invite dialogs
└── components/layout/ # AppShell + Sidebar
```

## Key Conventions
- **DB queries**: always use `useLiveQuery()` from `dexie-react-hooks` — auto-rerenders on change
- **After every DB write**: call `triggerSync()` (`src/db/db.ts`) to push to cloud (no-op when disabled)
- **Hooks own all logic**: feature pages are thin; all DB reads/writes go in `useXxx` hooks
- **Category rule priority**: CNPJ prefix (priority 10) > name pattern (priority 5) > memo
- **Cloud realm**: use `requireRealmId()` when adding new records so they go to the shared realm, not rlm-public
- **Path alias**: `@/` maps to `src/`

## Adding a DB Table
1. Add the interface to `src/db/schema.ts`
2. Add a new `this.version(N).stores({...})` in `src/db/db.ts` (never modify existing versions)
3. Add `EntityTable<YourType, 'id'>` property to `FinanceDB` class

## AI Integration
- Provider abstraction in `src/features/suggestions/ClaudeAdvisor.ts`
- Supports: Anthropic (Claude), Gemini, OpenRouter, Ollama
- Config stored in `localStorage` under key `ai_provider_config`
- Three functions: `analyzeFinances()`, `categorizeTransactions()`, `callAI()`

## Testing
- Test files: `src/__tests__/*.test.ts`
- Use `fake-indexeddb/auto` to mock IndexedDB in tests
- Pattern: `beforeEach` opens a fresh DB, tests verify DB state directly
- Run: `npm run test`

## Commit Style
Conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`, `perf:`
