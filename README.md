# Meta PayNow — Next.js

Bulk billing recovery dashboard for Meta Ad Accounts.  
All Meta Graph API calls run **server-side** (Next.js API routes).  
Data is persisted in both **MySQL via Prisma** and **localStorage** (client-side cache).

---

## Stack

| Layer        | Tech                          |
|--------------|-------------------------------|
| Framework    | Next.js 15 (App Router)       |
| Database     | MySQL + Prisma ORM            |
| Client cache | localStorage                  |
| Meta API     | Graph API v25.0 (server-side) |
| Auth         | Facebook JS SDK (client-only) |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/meta_paynow"
```

### 3. Set up the database

**Option A — Run the SQL file directly (recommended for your setup):**

```bash
mysql -u root -p < database.sql
```

Or paste `database.sql` contents into your MySQL client (phpMyAdmin, TablePlus, etc).

**Option B — Use Prisma:**

```bash
npx prisma db push
# or for migrations:
npx prisma migrate dev --name init
```

### 4. Generate Prisma client

```bash
npm run db:generate
```

### 5. Run in development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Build for production

```bash
npm run build
npm start
```

---

## API Routes

| Method | Route                        | Purpose                                      |
|--------|------------------------------|----------------------------------------------|
| GET    | `/api/session`               | Load session by userId                       |
| POST   | `/api/session`               | Create/update session (userId, token, appId) |
| DELETE | `/api/session`               | Delete session + cascade all data            |
| POST   | `/api/meta/user`             | Fetch FB user info (server-side)             |
| POST   | `/api/meta/businesses`       | Fetch all Business Managers (server-side)    |
| POST   | `/api/meta/accounts`         | Fetch ad accounts for selected BMs           |
| GET    | `/api/meta/accounts`         | Load accounts from DB for a userId           |
| PATCH  | `/api/meta/accounts`         | Update account result/status in DB           |
| DELETE | `/api/meta/accounts`         | Clear all accounts for a userId              |
| POST   | `/api/meta/verify`           | Verify account balance after payment         |
| POST   | `/api/meta/business-users`   | Fetch BM users for "Add User" modal          |
| POST   | `/api/meta/assign`           | Assign user to ad account                    |

---

## Data flow

```
FB SDK (client) ──token──► Next.js API routes ──► Meta Graph API
                                    │
                                    ▼
                              MySQL (Prisma)
                                    │
                              ◄─────┘
                         localStorage (cache)
```

1. **FB SDK** runs client-side only for OAuth (required by Meta).
2. After login, the **token is sent to server API routes** for all Graph API calls.
3. Results are saved to **MySQL** and synced to **localStorage** for fast reload.
4. On next load, the app tries to restore accounts from DB before requiring a re-fetch.

---

## Browser Extension

The app communicates with the Meta PayNow browser extension via `CustomEvent` on `window`:

- `meta-paynow-extension-command` — dashboard → extension
- `meta-paynow-extension-response` — extension → dashboard
- `meta-paynow-extension-state` — extension live state broadcasts
- `meta-paynow-extension-ping` / `meta-paynow-extension-ready` — bridge heartbeat

Extension state is also synced via `localStorage` key `meta_paynow_extension_state`.

---

## Environment Variables

| Variable       | Description                  |
|----------------|------------------------------|
| `DATABASE_URL` | MySQL connection string       |
