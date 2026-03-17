# Growr Product Spec

## Positioning

Growr is not just a budgeting dashboard.

Growr is a financial decision engine that combines Plaid-powered budgeting, debt analysis, investing forecasts, and explainable recommendations so users know what their money should do next.

## Core Promise

Growr should help users:

- understand where money is going
- understand what is slowing progress
- see the long-term cost of current decisions
- compare alternative paths
- get one clear next move backed by numbers

## Product Thesis

`Growr = money clarity + next best move`

Growr should not compete by being "another dashboard."
Growr should compete by being the product that answers:

- What should I do next?
- Why?
- How much does it matter?
- What happens if I do it?

## Main Differentiators

### 1. Next Best Move

Every recommendation must be explainable and data-backed.

Required format:

- Action
- Why
- Math
- Time horizon
- Confidence / assumptions

Example:

- Action: Pay an extra $250 toward your highest-interest credit card this month
- Why: Plaid shows this card has a 24.99% APR and a $6,200 balance
- Math: Paying $250 extra saves an estimated $X in interest and shortens payoff by Y months
- Time horizon: next 3 months
- Confidence: High
- Assumptions: APR remains constant and no new charges are added

### 2. Grow Score

Grow Score should summarize financial health in a way users can understand and improve.

Subscores:

- cash flow stability
- debt pressure
- emergency fund strength
- retirement capture
- savings / investing consistency
- spending efficiency

The score must also show:

- what is hurting it most
- what single action raises it fastest

### 3. Opportunity Cost

Growr should show what current spending habits or recurring payments may cost over time if that cash were redirected toward higher-value uses.

Examples:

- This car payment may cost you $128,000 over 20 years
- $200/month of restaurant overspend could become $92,000 over time
- $85/month of subscriptions could become $34,000 over 15 years

### 4. Scenario Comparison

Users should be able to compare:

- current plan
- debt-first plan
- employer-match-first plan
- emergency-fund-first plan
- car reduction plan
- higher investing plan

Each scenario should show:

- 12-month cash position
- debt payoff date
- total interest paid
- 5-year net worth
- 10-year net worth

## Data Requirements

Growr should use Plaid data where available, but it must not pretend incomplete data is certain.

Use Plaid for:

- balances
- transactions
- liabilities
- investments
- recurring transactions when supported

Always degrade confidence when data is missing.

Examples:

- missing APR
- missing minimum payment
- missing due date
- uncertain recurring transfer classification

## Recommendation Rules

### Toxic debt first

If:

- credit card APR exceeds baseline expected investing returns
- recurring brokerage or Roth investing is detected
- full 401(k) employer match is not being sacrificed

Then:

- recommend redirecting part of investing toward toxic debt temporarily
- show math and payoff acceleration

### Preserve employer match

If:

- 401(k) contribution is below the employer match threshold

Then:

- recommend capturing the full match before extra brokerage investing

### Negative cash flow

If:

- free cash flow is negative

Then:

- recommend cutting discretionary spending first
- pause non-essential investing

### Emergency fund floor

If:

- emergency fund is below 1 month of essential expenses

Then:

- recommend building a cash buffer before increasing taxable investing

### Car pressure

If:

- total car cost exceeds a meaningful share of take-home pay
- or car cost blocks debt payoff / savings recovery

Then:

- flag the vehicle as a pressure point
- show a lower-cost scenario

### Subscription leak detection

If:

- recurring subscriptions are meaningfully high

Then:

- recommend likely cancellation candidates
- show annual cost and long-term opportunity cost

## Dashboard Priorities

The main website dashboard should answer:

- what changed
- what hurts most
- what to do next

Main modules:

- Grow Score
- Next Best Move
- monthly cash flow
- debt pressure
- net worth
- current spend this month
- biggest opportunity cost
- scenario comparison preview
- accounts overview
- due soon
- payday

## UX Rules

Growr should feel:

- premium
- modern
- clear
- practical
- mathematically justified
- trustworthy

Growr should not feel like:

- a spreadsheet
- a cheap dashboard
- AI guessing at finances
- another generic budget app

## Website Direction

Growr is a website first.

The website should:

- keep strong budgeting and transaction visibility
- present recommendations more prominently than raw dashboards
- use charts that feel polished, premium, and explainable
- keep finance language understandable for beginners

Suggested homepage message:

- Headline: `Know your money. Grow your future.`
- Subtext: `Growr helps you understand spending, debt, and investing so you can make smarter financial moves every month.`

## Build Order

1. Next Best Move engine
2. Grow Score
3. Opportunity Cost
4. Scenario engine
5. Improve dashboard around these systems
6. Add richer AI and shareable cards

## Current Implementation Direction

The current codebase should keep:

- Snapshot
- Spending
- Recurring
- Transactions
- Net Worth
- Investing

But those pages should support the real core product:

- decision intelligence
- confidence-aware recommendations
- long-term cost visibility
- scenario comparison
