# Spendly — Expense Tracking PWA

## Project Overview

Spendly is a single-user, personal expense tracking Progressive Web App (PWA). It tracks daily spending, organizes expenses into categories (and category groups), gives monthly/yearly summaries and analytics, uses Gemini AI to turn text/receipt images/shared payment screenshots into expenses, and tracks money lent to / returned by people. It is intentionally separate from the fund management app (Velo), which handles recurring financial obligations.

There are no user accounts: access is gated by a time-based key (or WebAuthn biometrics), and every table is global to the one owner.

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript (Vite, SWC)
- **Styling**: Tailwind CSS v3 + a few shadcn/Radix primitives + framer-motion (page transitions)
- **Server state**: TanStack React Query v5, persisted to `localStorage` (7-day cache) via `PersistQueryClientProvider`
- **Client state**: Redux Toolkit (`src/store`) for date, filters and prefs
- **Forms**: mostly plain `useState` (react-hook-form + Zod are installed but not the norm)
- **HTTP**: Axios with auto-refresh interceptor
- **Charts**: Recharts
- **Dates**: date-fns v3
- **PWA**: vite-plugin-pwa, `injectManifest` strategy with a custom `src/sw.js`
- **Toasts**: Sonner
- **Biometrics**: `@simplewebauthn/browser`
- **Tests**: Vitest (`npm test`) — no test files exist yet

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express v5
- **ORM**: TypeORM + PostgreSQL (`synchronize: true` — no migrations, schema follows the entities)
- **Validation**: Joi
- **Auth**: JWT access token (1d) + refresh token (7d, HTTP-only cookie); WebAuthn via `@simplewebauthn/server`
- **AI**: Google Gemini (`@google/generative-ai`), with a fallback chain of models
- **Uploads**: multer (memory storage, 10 MB) for receipt images
- **Logging**: Morgan

## Repository Layout

```
spendly/
├── CLAUDE.md
├── backend/                       ← package "spendly-api" (port 5001)
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── test-ai.ts                 ← ad-hoc AI script, not part of the app
│   └── src/
│       ├── app.ts                 ← Express setup, CORS, route mounting
│       ├── server.ts              ← Entry: DB init → HTTP server
│       ├── config/data.source.ts  ← TypeORM DataSource (auto-loads *.entity.{ts,js})
│       ├── common/
│       │   ├── middlewares/       ← error (ApiError), protect (JWT), validate (Joi)
│       │   └── utils/             ← asyncHandler, keyValid (time-based key), date.utils (IST helpers)
│       └── modules/
│           ├── auth/              ← controller + routes only
│           ├── categories/        ← entity, service, controller, routes, validations
│           ├── category-groups/   ← same set (file names are camelCase: categoryGroup.*.ts)
│           ├── expenses/          ← expense.* + expense.ai.service.ts + 3 helper entities
│           ├── merchants/         ← merchant-rule.* (shop → category rules for the AI)
│           ├── people/            ← person + debt-transaction entities, service, controller, routes
│           └── webauthn/          ← credential entity, service, controller, routes
└── frontend/                      ← package "spendly" (port 8081)
    ├── .env.example
    ├── vite.config.ts             ← PWA manifest, share_target, shortcuts, `@` alias
    ├── public/                    ← logo.png, logo-192.png, icon-maskable*.png, badge.svg
    ├── scripts/generate-icons.mjs
    └── src/
        ├── App.tsx                ← providers + all routes
        ├── main.tsx, index.css
        ├── sw.js                  ← service worker: shell cache, share target, background AI parse + push
        ├── features/
        │   ├── dashboard/         ← month summary, category breakdown, recent expenses, FutureSpendPlanner
        │   ├── expenses/          ← list, add/edit, bulk AI parse, missed-expense suggestions, share flows
        │   ├── categories/        ← categories, groups, category/group detail pages
        │   ├── merchants/         ← merchant rules ("shops") per category
        │   ├── people/            ← lent/returned ledger, share-to-people flow
        │   ├── analytics/         ← trend chart, category pie, AI month insights
        │   ├── webauthn/          ← biometric API + hooks (cashback toggle)
        │   └── unlock/            ← time-key / biometric unlock page
        ├── components/            ← Layout (bottom nav, pull-to-refresh), AnimatedOutlet, ui/ (BottomSheet, ConfirmModal, sheet), toasts, DateTimePicker, EmptyState…
        ├── context/               ← SwipeGestureContext, ThemeContext (dark | light)
        ├── store/                 ← Redux: dateSlice, filterSlice, prefsSlice, hooks
        ├── hooks/                 ← useLongPress, useBackToClose, useRefetchOnFocus, useQueryFreshness…
        ├── lib/                   ← apiClient.ts (Axios + refresh interceptor), utils.ts (cn, formatINR, month helpers)
        ├── routes/                ← ProtectedRoute, PublicRoute
        └── utils/                 ← getErrorMessage, keyboard, navigation
```

## Architecture Rules

### Backend
- **Module structure**: Each feature lives in `src/modules/{feature}/` with entity → service → controller → routes (→ validations). Some modules are smaller (`auth` has no entity/service; `people` and `webauthn` have no validations file) — follow the nearest existing module.
- **Services**: Hold the business logic. Throw `new ApiError(message, statusCode)` (from `common/middlewares/error.middleware`) — never plain strings.
- **Controllers**: Arrow-function properties on a class that call the service and `res.json()`. No try/catch — Express 5 forwards async errors to `errorHandler`. Controllers may do light query-param parsing and, in `ExpenseController`, assemble AI/analysis inputs.
- **Routes**: Instantiate the controller, put Joi `validate(schema)` before handlers on body-carrying routes. Declare fixed paths (`/summary`, `/missed`…) before `/:id`.
- **Entities**: UUID primary keys, `decimal(12,2)` for money (TypeORM returns decimals as strings — wrap in `Number()`), `date` columns as `string` (yyyy-MM-dd), `time` as `HH:mm` string. Entities are auto-discovered by the `*.entity.ts` glob; with `synchronize: true`, changing an entity changes the DB schema on next boot.
- **Relations**: `Expense.category` is `eager: true`, so plain `find()` already includes it. Deleting a category sets `expense.category` to null (`onDelete: SET NULL`).
- **Timezone**: Server logic uses IST via `common/utils/date.utils.ts` (`getISTParts`, `getISTDateString`). Don't use `new Date()` for "today".
- **Auth**: Everything except `/auth/*` and `/health` is behind `protect` (Bearer JWT).
- **Caching**: `CategoryService` caches the category list in memory for 1h — call `CategoryService.clearCache()` (or null the cache) after any change that affects categories.

### Frontend
- **Feature structure**: `features/{feature}/{api,types,hooks,utils,components,pages}` — only the folders a feature needs.
- **API layer** (`{feature}Api.ts`): Flat async object using `apiClient`. No error handling — errors surface to React Query.
- **Hooks**: React Query. Key constants like `const EXPENSES_KEY = ['expenses'] as const`, with narrower keys spread from them (`[...EXPENSES_KEY, 'summary', year, month]`). `staleTime: 30_000` is the norm. Mutations `invalidateQueries` on success and surface errors with `toast.error(getErrorMessage(err))`.
- **Client state**: Redux Toolkit for state shared across pages — `date` (selected year/month + month|year view, kept in sessionStorage), `filters` (expense search + category filter), `prefs` (`showGross` cashback view, kept in localStorage). Use `useAppSelector`/`useAppDispatch` from `@/store/hooks`. Local form state stays in `useState`.
- **Styling**: Tailwind utility classes + `cn()`. CSS variables for theming (dark default, plus light).
- **Layout/gestures**: Pages render inside `Layout` (bottom nav, pull-to-refresh, swipe between tabs via `AnimatedOutlet`). Sheets/modals must disable the swipe gesture while open (via `SwipeGestureContext`). Native browser pull-to-refresh is suppressed with `overscroll-behavior-y` on `html`.
- **Imports**: Always the `@/` alias (maps to `src/`).
- **Offline**: React Query cache persists to localStorage and the service worker caches the app shell; both can serve stale data after a deploy (clear the SW cache when testing deploys).

## Naming Conventions

| Artifact | Pattern | Example |
|---|---|---|
| Backend entity | PascalCase singular | `Expense`, `Category`, `MerchantRule` |
| Backend service | `{Feature}Service` | `ExpenseService` |
| Backend controller | `{Feature}Controller` | `ExpenseController` |
| Backend route file | `{feature}.routes.ts` (kebab/camel to match module folder) | `expense.routes.ts`, `categoryGroup.routes.ts`, `merchant-rule.routes.ts` |
| Frontend page | `{Feature}{Action}Page` | `AddExpensePage` |
| Frontend component | `{Feature}{Purpose}` | `ExpenseCard`, `CategoryPicker` |
| Frontend hook | `use{Feature}{Action}` | `useExpensesQuery`, `useCreateExpense` |
| Frontend API object | `{feature}Api` | `expensesApi` |
| Query key constant | `{FEATURE}_KEY` | `const EXPENSES_KEY = ['expenses']` |

## Domain Model

Money is INR (`formatINR` on the frontend). All dates are yyyy-MM-dd strings.

### Category
```
id UUID, name (unique), icon (emoji), color (hex),
groupName string|null  → references CategoryGroup.name (validated against the groups list),
isDefault boolean, createdAt
```
15 defaults are seeded by `POST /categories/seed` (no-op if any category exists).

### CategoryGroup
```
id UUID, name (unique), sortOrder int, createdAt
```
A named bucket of categories (stored on the category as `groupName`, not as a foreign key). Group pages show combined spend for all member categories.

### Expense
```
id UUID, amount decimal(12,2), cashback decimal(12,2) (default 0),
description string, date (indexed), time 'HH:mm'|null, note string|null,
category → Category (ManyToOne, eager, nullable, onDelete SET NULL),
createdAt, updatedAt
```
- **Cashback**: net spend = `amount − cashback`. The UI shows net by default; `prefs.showGross` (cashback view) is toggled with a long press and gated behind a WebAuthn biometric check.
- **There is no payment method field** (earlier docs listed one; it was never built).

### MerchantRule
`id, name (unique), aliases string[], category → Category (CASCADE), createdAt, updatedAt` — fed to the AI prompts as hard rules ("anything from this shop goes to this category").

### Person / DebtTransaction
- `Person`: `id, name, phoneNumber, transactions[]`. `balance` is computed in the service: sum of `GIVEN` minus sum of `RETURNED`.
- `DebtTransaction`: `id, amount, type 'GIVEN'|'RETURNED', date, note, person (CASCADE)`.

### Support tables (expenses module)
- `MonthlyAiInsight` — cached AI month analysis, keyed by `(year, month)`, invalidated by an `inputHash` of the underlying numbers.
- `MissedCursor` — single row: everything on or before this date is resolved for missed-expense suggestions.
- `MissedDismissal` — suggestions the user discarded or saved under another category, unique on `(date, categoryId, slotKey)`; server-side so it syncs across devices.

### WebauthnCredential
Registered biometric devices (`credentialId`, `publicKey`, `counter`, `transports`, `deviceName`).

## Features

- **Dashboard**: month summary, category breakdown, recent expenses, optional FutureSpendPlanner (what-if projection of month-end spend; state in localStorage).
- **Expenses**: month or full-year view, search (description/note) and multi-category filter (client-side, `filterSlice`), add/edit with time and cashback, detail sheet, undo toast on delete.
- **AI input** (Gemini): natural-language text parse, **Bulk Add** (several expenses from one pasted text), receipt image parse, "revise with an instruction", and AI month analysis. Expense description style: real major items first (+N), never a generic label.
- **Missed expenses**: suggests habitual expenses you probably forgot to log (based on past frequency), resolved/dismissed server-side.
- **Share target / background parse**: the PWA registers as a Web Share Target (images and text). `sw.js` can parse in the background and push a notification; results queue in the `spendly-share` cache and surface in Pending Shares. A shared transfer can be routed to People instead of an expense.
- **Categories & groups**: CRUD, group assignment, category/group detail pages with yearly/range reports, merchant "shops" rules.
- **People**: lent/returned ledger with running balance.
- **Analytics**: 6-month trend, category pie, AI insights (spike days, unusual expenses).
- **Auth**: time-based key unlock, optional biometric unlock, silent refresh.
- **Not built (deferred)**: budgets, recurring expenses, payment methods, data export.

## API Endpoints

All under `/api/v1`. "Auth" = Bearer JWT required.

```
POST   /auth/unlock                 Public  Time-based key → access token + refresh cookie
POST   /auth/refresh                Public  Refresh cookie → new access token
POST   /auth/logout                 Public  Clear refresh cookie
POST   /auth/webauthn/challenge     Public  Biometric login challenge
POST   /auth/webauthn/login         Public  Verify biometric → tokens

GET    /categories                  Auth    List
GET    /categories/:id              Auth    Single
POST   /categories                  Auth    Create
PUT    /categories/:id              Auth    Update
DELETE /categories/:id              Auth    Delete
POST   /categories/seed             Auth    Seed defaults

GET    /category-groups             Auth    List
POST   /category-groups             Auth    Create
PUT    /category-groups/:id         Auth    Update
DELETE /category-groups/:id         Auth    Delete

GET    /expenses                    Auth    List (query: year, month | scope=year, categoryId)
GET    /expenses/summary            Auth    Totals by category (query: year, month | period=year)
GET    /expenses/analytics          Auth    Last N months trend (query: months=6)
GET    /expenses/analyze            Auth    AI month insights (query: year, month, force)
GET    /expenses/by-category        Auth    Category or group report (query: categoryId|groupId, year | start+end)
GET    /expenses/missed             Auth    Missed-expense suggestions
POST   /expenses/missed/resolve     Auth    Mark suggestions resolved/dismissed
POST   /expenses/parse-text         Auth    AI: one expense from text
POST   /expenses/parse-bulk-text    Auth    AI: many expenses from text
POST   /expenses/parse-image        Auth    AI: expense from receipt image (multipart "image")
POST   /expenses/revise             Auth    AI: edit an expense by instruction
GET    /expenses/:id                Auth    Single
POST   /expenses                    Auth    Create
PUT    /expenses/:id                Auth    Update
DELETE /expenses/:id                Auth    Delete

GET    /merchant-rules              Auth    List
POST   /merchant-rules              Auth    Create
PUT    /merchant-rules/:id          Auth    Update
DELETE /merchant-rules/:id          Auth    Delete

GET    /people                      Auth    List with computed balance
GET    /people/:id                  Auth    Person + transactions
POST   /people                      Auth    Create
PATCH  /people/:id                  Auth    Update
DELETE /people/:id                  Auth    Delete
POST   /people/:id/transactions     Auth    Add GIVEN/RETURNED transaction
DELETE /people/transactions/:id     Auth    Delete transaction

GET    /webauthn/status             Auth    Registration status
POST   /webauthn/challenge          Auth    Registration challenge
POST   /webauthn/register-verify    Auth    Verify registration
POST   /webauthn/auth-verify        Auth    Verify authentication
GET    /webauthn/devices            Auth    List devices
DELETE /webauthn/devices/:id        Auth    Remove device

GET    /health (no /api/v1 prefix)  Public  Liveness check
```

## Frontend Routes

```
/unlock                Public
/share-processing      Share-target landing (no auth gate)
/ai-test               Auth    Dev page for AI parsing
/                      Dashboard
/expenses, /expenses/new (?bulk=true), /expenses/:id/edit
/categories, /categories/new, /categories/:id, /categories/:id/edit,
/categories/group/:id, /categories/shops
/analytics
/people, /people/:id, /people/:id/edit, /share-to-people, /share-pending
```
Bottom nav tabs: Dashboard, Expenses, People, Analytics, Categories.

## Environment Variables

### Backend (`backend/.env`, see `backend/.env.example`)
```
PORT=5001

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_NAME=spendly
# or: DB_URL=postgresql://user:pass@host:5432/spendly

FRONTEND_URL=http://localhost:8081

JWT_SECRET=
REFRESH_SECRET=

# Time-based key: valid key = PREFIX + HH + MM (IST) + SUFFIX; APP_ACCESS_KEY is a fixed override
PREFIX=
SUFFIX=
APP_ACCESS_KEY=

GEMINI_API_KEY=                 # AI parsing and insights
# WEBAUTHN_RP_ID=               # optional; defaults to FRONTEND_URL's hostname
```

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:5001/api/v1
```

## Development

```bash
# Backend
cd backend
npm install
npm run dev          # ts-node-dev, auto-restart (port 5001)
npm run build        # tsc → dist/
npm start            # node dist/server.js

# Frontend
cd frontend
npm install
npm run dev          # Vite on port 8081
npm run build        # tsc -b && vite build
npm test             # vitest run
```

**Before calling a frontend change done, run `npm run build`** — `tsc --noEmit -p .` alone has missed real JSX syntax errors that broke the deploy.

## Key Design Decisions

- **Separate app**: Not integrated into fund_management/Velo because expense data is ad-hoc and high-volume (different schema, different UX).
- **Ports 8081 / 5001**: Avoid conflict with Velo (8080 / 5000).
- **Same auth pattern as Velo**: Time-based key, JWT + refresh cookie. Spendly adds optional WebAuthn.
- **Single user**: No user table; all data is global. Don't add per-user scoping unless that changes.
- **Date as string**: `yyyy-MM-dd` strings avoid timezone ambiguity. Remember month ends differ in length (a past bug computed `-31` for every month).
- **IST everywhere server-side**: "today" and month boundaries come from the IST helpers.
- **AI via Gemini with model fallback**: `expense.ai.service.ts` tries a chain of models; overload errors are detected and retried.
- **AI insight caching**: Month analysis is cached in `monthly_ai_insights` and regenerated only when the input hash changes.
- **No budget module**: Deliberately deferred.
- **Schema sync, not migrations**: `synchronize: true`. Be careful with destructive entity changes (renames/drops) against the production DB.
