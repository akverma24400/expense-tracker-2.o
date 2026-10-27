# Expense Tracker

A MERN application for tracking income and expenses, managing categories and monthly budgets, and reviewing spending analytics. The API uses JWTs in an httpOnly cookie. Demo mode creates a separate expiring sandbox for each visitor.

## Features

- Register, log in, log out, and restore a session after refresh.
- Create, edit, filter, search, sort, paginate, and delete income and expense transactions.
- Use 11 default categories created at registration and add custom categories. Categories with transactions cannot be deleted or have their type changed.
- Set monthly budgets and see spending, remaining amounts, and budget status: `ok`, `warning` (80% or more), or `exceeded` (100% or more).
- View monthly summaries, category totals, daily totals, trends, top expenses, and month comparisons.
- Try demo mode with randomized sample data in an isolated sandbox.
- View screenshots of the [dashboard](frontend/public/screenshots/dashboard.png), [transactions](frontend/public/screenshots/transactions.png), [analytics](frontend/public/screenshots/analytics.png), and [budgets](frontend/public/screenshots/budgets.png).

## Technology

| Area | Technology |
|---|---|
| Frontend | React, Vite, React Router, Recharts, Axios |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose |
| Authentication | JWT cookie, bcryptjs |
| Request validation | Zod |

Amounts are stored as integer paise and returned by the API in rupees. Backend queries are scoped to the authenticated user. Date ranges and analytics use `APP_TIMEZONE`. Analytics use 6 MongoDB aggregation pipelines (5 in `analytics.controller.js` and 1 in `budget.controller.js` for budget spend).

## Design decisions

- **Money is stored as integer paise** to avoid floating-point errors. The API accepts and returns rupees.
- **Every query is scoped to the logged-in user** (`user: req.user.id`). The user id comes from the token, never from the request body. Another user's data returns `404`, so its existence is not revealed.
- **Analytics use aggregation pipelines** with `$match` first so the compound index `{ user: 1, date: -1 }` can be used. See the Performance section for a sample explain result.
- **Timezone-aware dates.** Month boundaries and day or month grouping use the configurable `APP_TIMEZONE`.
- **Layered validation:** Zod validates requests, controller rules enforce business constraints, and Mongoose validates stored documents.
- **One error format.** The global error handler returns `{ success, message, errors }`.
- **Missing days and months are filled in on the server**, so charts receive continuous series.

## Project layout

```text
backend/
  server.js
  src/
    routes/       API routes
    controller/   Request handlers
    models/       Mongoose models
    middleware/   Authentication, validation, errors, demo limiter
    services/     Demo creation and cleanup
    seed/         Seed and explain scripts
frontend/
  src/            React application and API client
  public/         Static assets and screenshots
  vercel.json     Vercel API rewrite and SPA fallback
```

## Requirements

- Node.js 18 or newer
- MongoDB, either local or MongoDB Atlas

## Local setup

Install and configure the backend:

```bash
cd backend
npm install
```

Copy `backend/.env.example` to `backend/.env`, then set the required database and JWT values. Start the API:

```bash
npm run dev
```

The API listens on port `5000` by default. Its health endpoint is `http://localhost:5000/api/health`.

In another terminal, configure and start the frontend:

```bash
cd frontend
npm install
```

Set `VITE_API_URL=http://localhost:5000/api` in `frontend/.env` for local development, then run:

```bash
npm run dev
```

The Vite development server normally runs at `http://localhost:5173`. If you change `VITE_API_URL`, restart Vite.

## Environment variables

Use placeholder values in local and deployment configuration. Never commit `.env` files or real secrets.

### Backend

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | Listening port; defaults to `5000`. Render supplies this value when deployed. |
| `NODE_ENV` | No | Set to `production` for deployment; cookie security and error details depend on this value. |
| `MONGO_URI` | Yes | MongoDB connection string, including the database name, e.g. `<MONGODB_CONNECTION_STRING_WITH_DATABASE_NAME>`. |
| `JWT_SECRET` | Yes | Secret used to sign and verify authentication tokens. Use a strong private value. |
| `JWT_EXPIRES_IN` | No | JWT lifetime passed to the token signer; e.g. `7d`. |
| `CLIENT_URL` | Yes for browser CORS | Exact frontend origin, e.g. `https://<VERCEL_DOMAIN>`; no trailing slash. |
| `APP_TIMEZONE` | No | Timezone for date and month calculations; defaults to `Asia/Kolkata`. |
| `DEMO_TTL_MINUTES` | No | Demo lifetime in minutes; defaults to `120` and is clamped to `5`–`1440`. |
| `DEMO_MAX_ACTIVE` | No | Active demo sandbox cap; defaults to `200` when unset or invalid. |
| `DNS_SERVERS` | No | Optional comma-separated DNS resolver addresses, e.g. `<DNS_IP_1>,<DNS_IP_2>`. |
| `DEBUG_PROXY` | No | Set to `true` to log `req.ip` and `X-Forwarded-For` for demo-start requests while checking proxy configuration. |

### Frontend

| Variable | Local development | Production |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | `/api` |

## Scripts

Run frontend commands from `frontend/` and backend commands from `backend/`.

| Package | Command | Description |
|---|---|---|
| Backend | `npm run dev` | Start the API with nodemon. |
| Backend | `npm start` | Start the API with Node.js. |
| Backend | `npm run seed -- --reset` | Create or reuse `rahul@test.com` and its default categories, delete only that user's transactions, and insert 5,000 random transactions. Refuses to run when `NODE_ENV=production`. |
| Backend | `npm run explain [YYYY-MM]` | Compare an indexed query with a forced collection scan for one month (defaults to the previous complete month). |
| Backend | `npm test` | Runs the Vitest suite. |
| Frontend | `npm run dev` | Start the Vite development server. |
| Frontend | `npm run build` | Build the frontend for deployment. |
| Frontend | `npm run preview` | Preview the production build locally. |
| Frontend | `npm run lint` | Run ESLint. |

## Demo sandbox

Try the live demo: [expense-tracker-sandy-five-93.vercel.app/demo](https://expense-tracker-sandy-five-93.vercel.app/demo).

`POST /api/auth/demo` creates a new guest user with randomized credentials and sample transactions and budgets. The server sets the normal authentication cookie for that guest. Each demo and its created categories, transactions, and budgets receive an `expiresAt` value.

The default lifetime is 120 minutes; `DEMO_TTL_MINUTES` is clamped from 5 to 1440 minutes. MongoDB TTL indexes expire documents by `expiresAt`. The server also runs a cleanup job every 15 minutes and starts cleanup after demo creation.

Demo creation is limited to 20 requests per hour per IP. The active demo cap defaults to 200. Each demo user can create up to 300 transactions, 30 categories, and 30 budgets. These are demo-specific limits; there is no global API rate limiter.

## API reference

Protected routes require the `token` cookie set by registration, login, or demo start. `POST /api/auth/logout` is public and clears the cookie.

### Auth

| Method | Path | Description | Login required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create an account and sign in. | No |
| `POST` | `/api/auth/login` | Sign in. | No |
| `POST` | `/api/auth/logout` | Clear the authentication cookie. | No |
| `GET` | `/api/auth/me` | Return the current user. | Yes |
| `PUT` | `/api/auth/profile` | Update the current user's profile. | Yes |
| `POST` | `/api/auth/demo` | Create and sign in to a demo sandbox. | No |

### Categories

| Method | Path | Description | Login required |
|---|---|---|---|
| `GET` | `/api/categories` | List the current user's categories. | Yes |
| `POST` | `/api/categories` | Create a category. | Yes |
| `PUT` | `/api/categories/:id` | Update a category. | Yes |
| `DELETE` | `/api/categories/:id` | Delete an unused category. | Yes |

### Transactions

| Method | Path | Description | Login required |
|---|---|---|---|
| `GET` | `/api/transactions` | List transactions with optional filters. | Yes |
| `POST` | `/api/transactions` | Create a transaction. | Yes |
| `GET` | `/api/transactions/:id` | Get one transaction. | Yes |
| `PUT` | `/api/transactions/:id` | Update a transaction. | Yes |
| `DELETE` | `/api/transactions/:id` | Delete a transaction. | Yes |

List query parameters: `type`, `category`, `from`, `to`, `search`, `page` (default `1`), `limit` (default `10`, maximum `100`), and `sort` (`date`, `-date`, `amount`, or `-amount`).

### Budgets

| Method | Path | Description | Login required |
|---|---|---|---|
| `GET` | `/api/budgets` | List budgets for a month, including spend and status. | Yes |
| `POST` | `/api/budgets` | Create a budget for an expense category and month. | Yes |
| `PUT` | `/api/budgets/:id` | Update a budget limit. | Yes |
| `DELETE` | `/api/budgets/:id` | Delete a budget. | Yes |

The `GET` endpoint accepts `month` in `YYYY-MM` format; it defaults to the current month.

### Analytics

| Method | Path | Description | Login required |
|---|---|---|---|
| `GET` | `/api/analytics/summary` | Monthly income, expense, and balance. | Yes |
| `GET` | `/api/analytics/by-category` | Totals by category for a month and type. | Yes |
| `GET` | `/api/analytics/top-expenses` | Largest expenses for a month. | Yes |
| `GET` | `/api/analytics/daily` | Daily totals for a month and type. | Yes |
| `GET` | `/api/analytics/monthly-trend` | Income, expense, and balance by month. | Yes |
| `GET` | `/api/analytics/compare` | Compare a month with the previous month. | Yes |

Analytics routes accept query parameters such as `month`, `type`, `months`, and `limit`, depending on the endpoint. If `month` is omitted where supported, the current month is used.

### Health

| Method | Path | Description | Login required |
|---|---|---|---|
| `GET` | `/api/health` | API status and demo feature flag. | No |

### Example request and response

```http
POST /api/transactions
Content-Type: application/json
Cookie: token=<JWT>

{ "type": "expense", "amount": 250.75, "category": "<CATEGORY_ID>", "note": "Lunch", "paymentMethod": "upi" }
```

```json
{
  "success": true,
  "transaction": {
    "_id": "<TRANSACTION_ID>",
    "type": "expense",
    "amount": 250.75,
    "category": { "name": "Food", "color": "#ef4444", "type": "expense" },
    "note": "Lunch",
    "paymentMethod": "upi"
  }
}
```

Responses use `success`, `message`, and `errors` as applicable. Validation errors include the field and message:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "amount", "message": "Amount must be greater than 0" }]
}
```

## Deployment

### Vercel frontend

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output / publish directory | `dist` |
| Environment variable | `VITE_API_URL=/api` |

The `/api/:path*` rewrite in `frontend/vercel.json` must point to the actual Render host. Replace `__BACKEND_HOST__` with that host before deploying.

### Render API

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |

Configure these Render environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `<MONGODB_CONNECTION_STRING_WITH_DATABASE_NAME>` |
| `JWT_SECRET` | `<PRIVATE_RANDOM_SECRET>` |
| `JWT_EXPIRES_IN` | `7d` or the desired token lifetime |
| `CLIENT_URL` | `https://<VERCEL_DOMAIN>` (exact origin, no trailing slash) |
| `APP_TIMEZONE` | `Asia/Kolkata` or the desired timezone |
| `DEMO_TTL_MINUTES` | `120` or the desired demo lifetime |
| `DEMO_MAX_ACTIVE` | `200` or the desired active-demo cap |
| `DEBUG_PROXY` | `false` normally; temporarily set `true` to inspect proxy logs |
| `DNS_SERVERS` | Optional, comma-separated resolver IPs |

Render provides `PORT`; the application uses that value when supplied and otherwise defaults to `5000`.

Safari blocks third-party cookies, so the Vercel rewrite serves API requests under the frontend's origin. Set `VITE_API_URL=/api` in production so browser requests use that same origin. The rewrite forwards `/api/*` to the Render API. A free Render server can take up to a minute to wake up; leave the page open while a request is loading.

## Testing

Automated tests live in `backend/tests` and use Vitest, Supertest, and `mongodb-memory-server`. They run against an in-memory database, so they do not touch real data.

Run them with:

```bash
cd backend && npm install && npm test
```

The test files cover:

- `auth.test.js`: protected routes return `401` without a cookie, login sets an httpOnly cookie, passwords are never returned, and Zod rejects invalid bodies.
- `money.test.js`: amounts are stored as integer paise and returned in rupees; summing `0.1` and `0.2` returns exactly `0.3`.
- `isolation.test.js`: a user cannot read, edit, or delete another user's transactions, categories, or budgets (`404`); analytics do not include another user's data.

Current result: 3 test files, 5 tests, all passing.

Endpoints were also checked manually with Postman, including timezone boundaries.

## Performance

The Transaction model has the compound index `{ user: 1, date: -1 }`. Monthly queries were checked with MongoDB `explain("executionStats")`. This is one sample run, not a guarantee:

| | Indexed | Collection scan |
|---|---|---|
| Plan | `FETCH -> IXSCAN(user_1_date_-1)` | `COLLSCAN` |
| Documents returned | 412 | 412 |
| Documents examined | 412 | 10,173 |
| Median time (4 runs after a warm-up) | 1.5 ms | 7 ms |

This sample used month `2026-09`. The collection held 10,173 transactions, 5,000 of them for the seed user. Times are server-side `executionTimeMillis`, rounded, exclude network time, and vary between runs; documents examined is the more reliable comparison.

Reproduce the measurement with:

```bash
cd backend
npm run seed -- --reset
npm run explain
```

Seed data is random, so counts can differ slightly. `npm run explain [YYYY-MM]` accepts a month to compare other than the previous complete month.

## Troubleshooting

| Symptom | Check |
|---|---|
| `ERR_MODULE_NOT_FOUND` | Local imports in this ES module project need the `.js` extension. |
| `querySrv ECONNREFUSED` | Some networks cannot resolve MongoDB Atlas SRV records. Set optional `DNS_SERVERS` to comma-separated resolver IPs. |
| Data appears in a database named `test` | Include the intended database name in `MONGO_URI`, for example `<MONGODB_HOST>/<DATABASE_NAME>?<OPTIONS>`. |
| `401` right after login | Check that the `token` cookie is enabled and sent to the same host as the request. |
| `POST /api/auth/demo` returns `404` | Confirm the API has the demo route and `GET /api/health` returns `features.demo: true`; check that `VITE_API_URL` ends in `/api`. |
| Demo session is busy | The active sandbox cap may have been reached. Wait for a demo to expire or adjust `DEMO_MAX_ACTIVE`. |
| Frontend shows `Request failed with status code 404` or `Network Error` | Check `VITE_API_URL`, restart the Vite dev server after changing it, and make sure the backend is running. For deployment, check the Vercel `/api` rewrite destination. |
| Login works, but the session is lost in Safari | Ensure production uses the Vercel `/api` proxy so the browser sees the API under the frontend origin. |
| CORS error | Set `CLIENT_URL` to the exact frontend origin, including scheme and host but no trailing slash. |

## Roadmap

- [x] Authentication, profile updates, and session restoration
- [x] Categories and transaction CRUD
- [x] Monthly budgets and analytics
- [x] Isolated demo sandboxes with expiry and per-demo limits
- [ ] CSV export
- [ ] Recurring transactions
- [ ] Helmet and global rate limiting
- [x] Automated tests
- [ ] Refresh tokens
- [ ] Docker support
- [ ] Receipt upload
- [ ] Forgot password

## License

MIT
