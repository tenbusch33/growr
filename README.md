# Growr

Colorful budgeting and investment forecasting prototype with:

- monthly budget planning
- investment projections for `401(k)`, `Roth IRA`, and brokerage
- recommendation engine for debt, cash flow, and car affordability
- local multi-user account signup and login flow
- planner save/load per signed-in user
- plan-based feature gating for Budget Core vs Bundle
- Stripe/Supabase-ready configuration hooks
- Plaid account linking scaffold for balances, liabilities, and investments

## Run locally

1. Copy `.env.example` to `.env`
2. Fill in any production values you have
3. Start the app:

```bash
npm start
```

Open `http://localhost:3000`.

## Deploy on Render

Render is a strong fit for this project because it supports a custom Node web service directly from GitHub with standard build and start commands. This app already matches that model with `npm start`, and the repo now includes the pieces needed for a smoother deployment.

Included deployment prep:

- `render.yaml`
- `GET /api/health` health check endpoint
- `DATA_DIR` support so JSON app data can live on a persistent disk
- Node engine metadata in `package.json`

### Recommended Render setup

1. Create a new `Web Service` from this GitHub repo.
2. Confirm these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
3. Add a persistent disk mounted at:

```text
/var/data/growr
```

4. Add this environment variable:

```env
DATA_DIR=/var/data/growr
```

5. Add any live secrets you want to enable, such as Stripe and Plaid credentials.

Without a persistent disk, local JSON data like accounts, sessions, planners, and imported transactions will reset on rebuilds and restarts.

## Environment variables

- `PORT`: local server port
- `DATA_DIR`: optional override for where Growr stores JSON app data
- `SUPABASE_URL`: used to indicate auth is connected
- `SUPABASE_ANON_KEY`: used to indicate auth is connected
- `STRIPE_CHECKOUT_BUDGET_URL`: hosted checkout or payment link for the `$7.99` plan
- `STRIPE_CHECKOUT_BUNDLE_URL`: hosted checkout or payment link for the `$12.99` bundle
- `STRIPE_SECRET_KEY`: Stripe secret key for Checkout, customer portal, and subscription management
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
- `STRIPE_PRICE_BUDGET`: recurring monthly price id for Budget Core
- `STRIPE_PRICE_BUNDLE`: recurring monthly price id for Budget + Investing
- `PLAID_CLIENT_ID`: Plaid client id
- `PLAID_SECRET`: Plaid secret
- `PLAID_ENV`: `sandbox`, `development`, or `production`

## Current behavior

- If Stripe URLs are configured, the signup flow opens the matching checkout page.
- If Stripe is not configured, the app stays in demo mode and shows the next step instead.
- Accounts are stored locally with hashed passwords and cookie sessions for development.
- Planner inputs save per signed-in user through the local Node API.
- Budget Core users can use budgeting features, while investing forecasts and allocation guidance are gated behind Bundle access.
- The local demo includes an upgrade path that switches a signed-in user from `budget` to `bundle`.
- If Stripe secret and price IDs are configured, signup and upgrade flows create real Stripe subscription checkout sessions instead of using demo-only access.
- Stripe webhook events can update subscription status and lock or unlock plan access based on billing state.
- If Supabase keys are configured, the UI marks auth as connected. This scaffold does not yet call Supabase directly; it prepares the app to plug that in next.
- If Plaid credentials are configured, users can open Plaid Link, exchange a `public_token`, and load connected accounts, liabilities, and investment holdings.
- If Plaid Transactions is configured, users can also import spending into the budgeting view using Plaid's recommended `/transactions/sync` flow.
- The current prototype stores the Plaid `access_token` locally in `data/plaid-items.json`. For production, this should be encrypted and stored per authenticated user.

## Stripe setup

Create two recurring monthly products in Stripe:

1. `Growr Budget Core`
   - monthly recurring price: `$7.99`
2. `Growr Budget + Investing`
   - monthly recurring price: `$12.99`

Copy the two Stripe price ids into:

```env
STRIPE_PRICE_BUDGET=price_...
STRIPE_PRICE_BUNDLE=price_...
```

Add your Stripe secret key:

```env
STRIPE_SECRET_KEY=sk_test_...
```

### Webhooks

Point your Stripe webhook to:

```text
POST /api/stripe/webhook
```

For local development with the Stripe CLI:

```bash
stripe login
stripe listen --events checkout.session.completed,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/stripe/webhook
```

Stripe will print a webhook signing secret. Copy it into:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Billing portal

Enable the Stripe customer portal in the Stripe Dashboard and allow:

- payment method updates
- subscription management
- cancellation if you want self-serve churn

The app uses `POST /api/billing/portal` to open a Stripe-hosted customer portal session for the signed-in user.

### What the app expects from Stripe

- `checkout.session.completed`: records the Stripe customer and subscription ids after checkout
- `invoice.paid`: marks the subscription active and unlocks access
- `invoice.payment_failed`: marks the account as unpaid and can re-lock paid features
- `customer.subscription.updated`: keeps local status in sync
- `customer.subscription.deleted`: marks the subscription inactive

## Suggested next implementation step

1. Add Supabase client signup/login
2. Encrypt and store Plaid items per authenticated user
3. Add Stripe webhook handling and subscription status storage
4. Save planner data per authenticated user
