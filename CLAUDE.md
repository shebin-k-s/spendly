# Spendly — Expense Tracking PWA

## Project Overview

Spendly is a personal monthly expense tracking Progressive Web App (PWA). It tracks daily spending, organizes expenses by category, and provides monthly summaries and analytics. It is intentionally built as a separate application from the fund management app (Velo), which handles recurring financial obligations.

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript (Vite)
- **Styling**: Tailwind CSS v3 + shadcn/ui components
- **State/Data**: TanStack React Query v5
- **Forms**: React Hook Form + Zod
- **HTTP**: Axios with auto-refresh interceptor
- **Charts**: Recharts
- **Dates**: date-fns
- **PWA**: vite-plugin-pwa
- **Toasts**: Sonner

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express v5
- **ORM**: TypeORM + PostgreSQL
- **Validation**: Joi
- **Auth**: JWT (access token) + refresh token (HTTP-only cookie)
- **Logging**: Morgan

## Repository Layout

```
spendly/
├── CLAUDE.md                        ← this file
├── backend/
│       ├── src/
│       │   ├── app.ts               ← Express setup, CORS, middleware, routes
│       │   ├── server.ts            ← Entry point: DB init → HTTP server
│       │   ├── config/
│       │   │   └── data.source.ts   ← TypeORM DataSource (Postgres)
│       │   ├── common/
│       │   │   ├── middlewares/
│       │   │   │   ├── error.middleware.ts    ← Global error handler
│       │   │   │   ├── protect.middleware.ts  ← JWT verification
│       │   │   │   └── validate.middleware.ts ← Joi body validation
│       │   │   └── utils/
│       │   │       ├── asyncHandler.ts        ← Promise error wrapper
│       │   │       └── keyValid.ts            ← Time-based access key
│       │   └── modules/
│       │       ├── auth/
│       │       │   ├── auth.controller.ts
│       │       │   └── auth.routes.ts
│       │       ├── categories/
│       │       │   ├── category.entity.ts
│       │       │   ├── category.service.ts
│       │       │   ├── category.controller.ts
│       │       │   ├── category.routes.ts
│       │       │   └── category.validations.ts
│       │       └── expenses/
│       │           ├── expense.entity.ts
│       │           ├── expense.service.ts
│       │           ├── expense.controller.ts
│       │           ├── expense.routes.ts
│       │           └── expense.validations.ts
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
└── frontend/
        ├── public/
        │   ├── sw.js                ← Service worker (offline + push)
        │   ├── badge.svg            ← Monochrome notification badge
        │   ├── logo.png             ← App icon (192×192 or 512×512)
        │   └── icon-maskable.png    ← Maskable icon for Android home screen
        ├── src/
        │   ├── features/
        │   │   ├── dashboard/       ← Monthly overview, category breakdown
        │   │   ├── expenses/        ← Add/edit/list expenses
        │   │   ├── categories/      ← Manage expense categories
        │   │   ├── analytics/       ← Charts: trends, category splits
        │   │   └── unlock/          ← Time-based auth page
        │   ├── components/
        │   │   ├── ui/              ← shadcn/ui primitives
        │   │   ├── Layout.tsx       ← Bottom nav + swipe gesture wrapper
        │   │   └── EmptyState.tsx
        │   ├── context/
        │   │   └── SwipeGestureContext.tsx
        │   ├── hooks/
        │   ├── lib/
        │   │   ├── apiClient.ts     ← Axios + auth interceptor
        │   │   └── utils.ts         ← cn() helper
        │   ├── routes/
        │   ├── utils/
        │   ├── App.tsx
        │   ├── main.tsx
        │   └── index.css
        ├── index.html
        ├── package.json
        ├── vite.config.ts
        └── tailwind.config.ts
```

## Architecture Rules

### Backend
- **Module structure**: Every feature lives in `src/modules/{feature}/` with entity → service → controller → routes → validations files
- **Services**: Contain all business logic. Throw `{ statusCode, message }` objects on errors — never throw plain strings
- **Controllers**: Arrow-function methods. Call service, return `res.json()`. No try/catch — errors bubble to `errorHandler`
- **Routes**: Instantiate controller, wire Joi `validate()` middleware before handlers
- **Entities**: UUID primary keys, `decimal(12,2)` for amounts, `date` columns as `string` (yyyy-MM-dd format)
- **Relations**: Always eager-load via `.find({ relations: [...] })`

### Frontend
- **Feature structure**: `features/{feature}/{api,types,hooks,utils,components,pages}`
- **API layer** (`{feature}Api.ts`): Flat async object. No error handling — errors surface to React Query
- **Hooks**: React Query only. `queryKey: ['feature']` hierarchy. `staleTime: 30_000`. Mutations call `invalidateQueries` on success
- **Styling**: Tailwind utility classes + `cn()` for conditional merging. CSS variables for theming
- **State**: `useState` for local form state. No global state library
- **Imports**: Always use `@/` alias (maps to `src/`)

## Naming Conventions

| Artifact | Pattern | Example |
|---|---|---|
| Backend entity | PascalCase singular | `Expense`, `Category` |
| Backend service | `{Feature}Service` | `ExpenseService` |
| Backend controller | `{Feature}Controller` | `ExpenseController` |
| Backend route file | `{feature}.routes.ts` | `expense.routes.ts` |
| Frontend page | `{Feature}{Action}Page` | `AddExpensePage` |
| Frontend component | `{Feature}{Purpose}` | `ExpenseCard`, `CategoryPill` |
| Frontend hook | `use{Feature}{Action}` | `useExpensesQuery`, `useCreateExpense` |
| Frontend API object | `{feature}Api` | `expensesApi` |
| Query key constant | `{FEATURE}_KEY` | `const EXPENSES_KEY = ['expenses']` |

## Domain Model

### Category
Organizes expenses. Has an icon (emoji) and color. Default categories are seeded on first boot.

```
id          UUID (PK)
name        string
icon        string  (emoji, e.g. "🍔")
color       string  (hex, e.g. "#f97316")
isDefault   boolean
createdAt   timestamp
```

### Expense
A single spending entry tied to a category.

```
id              UUID (PK)
amount          decimal(12,2)
description     string
date            string  (yyyy-MM-dd)
note            string  (nullable)
paymentMethod   'cash' | 'card' | 'upi' | 'bank_transfer' | 'other'
category        → Category (ManyToOne)
createdAt       timestamp
updatedAt       timestamp
```

## API Endpoints

```
POST   /api/v1/auth/unlock             Public  Time-based key → JWT
POST   /api/v1/auth/refresh            Public  Refresh token → new access token

GET    /api/v1/categories              Auth    List all categories
POST   /api/v1/categories              Auth    Create category
PUT    /api/v1/categories/:id          Auth    Update category
DELETE /api/v1/categories/:id          Auth    Delete category
POST   /api/v1/categories/seed         Auth    Seed default categories

GET    /api/v1/expenses                Auth    List (query: year, month, categoryId)
GET    /api/v1/expenses/summary        Auth    Monthly totals by category (query: year, month)
GET    /api/v1/expenses/analytics      Auth    Last N months trend (query: months=6)
GET    /api/v1/expenses/:id            Auth    Single expense
POST   /api/v1/expenses                Auth    Create expense
PUT    /api/v1/expenses/:id            Auth    Update expense
DELETE /api/v1/expenses/:id            Auth    Delete expense
```

## Environment Variables

### Backend (`backend/spendly-api/.env`)
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

PREFIX=
SUFFIX=
APP_ACCESS_KEY=
```

### Frontend (`frontend/spendly/.env`)
```
VITE_API_BASE_URL=http://localhost:5001/api/v1
```

## Development

```bash
# Backend
cd backend/spendly-api
npm install
npm run dev          # ts-node-dev, auto-restart

# Frontend
cd frontend/spendly
npm install
npm run dev          # Vite on port 8081
```

## shadcn/ui Setup

After `npm install` in the frontend, initialise and add required components:

```bash
npx shadcn@latest init
npx shadcn@latest add button input card badge skeleton select dialog sheet tabs scroll-area separator sonner
```

## Key Design Decisions

- **Separate app**: Not integrated into fund_management/Velo because expense data is ad-hoc high-volume (different schema, different UX model)
- **Port 8081 / 5001**: Avoids conflict with Velo (8080 / 5000)
- **Same auth pattern**: Time-based key, JWT + refresh cookie — consistent across both apps
- **Category seeding**: Default categories created once via `/categories/seed` endpoint; user can add/edit/delete after that
- **Date as string**: Stored as `yyyy-MM-dd` string to avoid timezone ambiguity, consistent with Velo
- **No budget module**: Intentionally deferred — core MVP focuses on tracking first
