const assert = require("node:assert/strict");
const shared = require("../engines/shared.js");
const { normalizeFinancialProfile } = require("../engines/plaidNormalizer.js");
const { createCashflowSnapshot } = require("../engines/cashflowEngine.js");
const { analyzeDebt } = require("../engines/debtEngine.js");
const { analyzeInvestments } = require("../engines/investmentEngine.js");
const { analyzeOpportunityCost } = require("../engines/opportunityCostEngine.js");
const { createGrowScore } = require("../engines/scoreEngine.js");
const { analyzeScenarios } = require("../engines/scenarioEngine.js");
const { buildRecommendations } = require("../engines/recommendationEngine.js");

function createProfile(overrides = {}) {
  return normalizeFinancialProfile({
    planner: {
      income: 6200,
      housing: 1800,
      essentials: 900,
      creditCardPayment: 250,
      otherDebt: 180,
      carPayment: 420,
      carCosts: 180,
      emergencyFund: 1800,
      creditCardBalance: 6200,
      cashAssets: 2400,
      carLoanBalance: 15000,
    },
    linkedSummary: {
      cashTotal: 2400,
      creditCardDebt: 6200,
      accounts: [{ name: "Checking" }],
      liabilities: [],
    },
    transactions: [
      { merchant: "Employer Payroll", amount: -3100, category: "income" },
      { merchant: "Employer Payroll", amount: -3100, category: "income" },
      { merchant: "Rent", amount: 1800, category: "housing" },
      { merchant: "Trader Joes", amount: 420, category: "groceries" },
      { merchant: "Netflix", amount: 18, category: "entertainment" },
      { merchant: "Dining", amount: 260, category: "dining and drinks" },
    ],
    subscriptions: [{ merchant: "Netflix", monthlyEstimate: 18 }],
    recurringBills: [{ merchant: "Rent", monthlyEstimate: 1800 }],
    recurringIncome: [{ merchant: "Employer Payroll", estimatedMonthlyIncome: 6200, transactionsCount: 4 }],
    investmentInputs: {
      age: 32,
      retirementAge: 67,
      retirementMonthlyGoal: 6500,
      retirementIncomeOther: 1200,
      k401Balance: 24000,
      k401Contribution: 300,
      rothBalance: 8000,
      rothContribution: 250,
      brokerageBalance: 6000,
      brokerageContribution: 150,
      hsaBalance: 3000,
      hsaContribution: 75,
    },
    hasInvestmentAccess: true,
    netWorth: 24000,
    ...overrides,
  });
}

{
  const payoff = shared.simulateDebtPayoff(6200, 0.2499, 250, 250);
  assert.equal(payoff.paidOff, true);
  assert.ok(payoff.months < 36);
  assert.ok(payoff.totalInterest > 0);
}

{
  const profile = createProfile();
  assert.equal(profile.monthlyIncomeNet, 6200);
  assert.ok(profile.monthlyRecurringInvestments >= 775);
  assert.equal(profile.subscriptions.length, 1);
}

{
  const profile = createProfile({
    transactions: [
      { merchant: "Employer Payroll", amount: -3100, category: "income", date: "2026-02-01" },
      { merchant: "Employer Payroll", amount: -3100, category: "income", date: "2026-02-15" },
      { merchant: "Employer Payroll", amount: -3100, category: "income", date: "2026-03-01" },
      { merchant: "Employer Payroll", amount: -3100, category: "income", date: "2026-03-15" },
      { merchant: "Rent", amount: 1800, category: "housing", date: "2026-02-03" },
      { merchant: "Rent", amount: 1800, category: "housing", date: "2026-03-03" },
      { merchant: "Dining", amount: 250, category: "dining and drinks", date: "2026-03-10" },
      { merchant: "Shopping", amount: 200, category: "shopping", date: "2026-03-12" },
    ],
    recurringIncome: [],
  });

  assert.equal(profile.monthlyIncomeNet, 6200);
  assert.ok(profile.monthlyDiscretionarySpend < 1000);
  assert.ok(profile.monthlyDiscretionaryBreakdown.length > 0);
}

{
  const profile = createProfile();
  const cashflow = createCashflowSnapshot(profile);
  const debt = analyzeDebt(
    {
      ...profile,
      debts: [
        {
          id: "card-a",
          name: "Card A",
          balance: 6200,
          apr: 0.2499,
          minimumPayment: 250,
        },
      ],
    },
    300
  );
  assert.ok(debt.toxicDebt);
  assert.ok(debt.toxicDebt.interestSavedWithExtraPayment > 0);
  assert.ok(cashflow.monthlyIncomeNet > 0);
}

{
  const profile = createProfile();
  const cashflow = createCashflowSnapshot(profile);
  const investments = analyzeInvestments(profile);
  const opportunity = analyzeOpportunityCost(profile, cashflow);
  const score = createGrowScore(
    profile,
    cashflow,
    { debts: [], totalMinimums: 430, totalBalance: 6200, toxicDebt: null },
    investments
  );

  assert.ok(investments.totalProjection10Y > investments.totalBalance);
  assert.ok(opportunity.biggest.futureValue >= opportunity.biggest.monthlyAmount);
  assert.ok(score.score >= 0 && score.score <= 100);
}

{
  const profile = createProfile();
  const cashflow = createCashflowSnapshot(profile);
  const debtAnalysis = analyzeDebt(
    {
      ...profile,
      debts: [
        {
          id: "card-a",
          name: "Card A",
          type: "credit_card",
          balance: 6200,
          apr: 0.2499,
          minimumPayment: 250,
        },
      ],
    },
    300
  );
  const investments = analyzeInvestments(profile, { assumptions: { k401: 0.07, roth: 0.07, brokerage: 0.065 } });
  const opportunity = analyzeOpportunityCost(profile, cashflow);
  const scenarios = analyzeScenarios(profile, cashflow, debtAnalysis, investments);
  const recommendationBundle = buildRecommendations(
    profile,
    cashflow,
    debtAnalysis,
    investments,
    opportunity,
    scenarios
  );

  assert.equal(recommendationBundle.nextBestMove.id, "toxic-debt-first");
  assert.ok(recommendationBundle.nextBestMove.mathExplanation.length > 0);
  assert.ok(recommendationBundle.nextBestMove.impact.interestSaved > 0);
}

{
  const profile = createProfile({
    planner: {
      income: 6200,
      housing: 1800,
      essentials: 900,
      creditCardPayment: 250,
      otherDebt: 180,
      carPayment: 420,
      carCosts: 180,
      emergencyFund: 1800,
      creditCardBalance: 6200,
      cashAssets: 2400,
    },
  });
  const cashflow = createCashflowSnapshot(profile);
  const debtAnalysis = analyzeDebt(profile, 200);
  const investments = analyzeInvestments(profile);
  const opportunity = analyzeOpportunityCost(profile, cashflow);
  const scenarios = analyzeScenarios(profile, cashflow, debtAnalysis, investments);
  const recommendationBundle = buildRecommendations(
    profile,
    cashflow,
    debtAnalysis,
    investments,
    opportunity,
    scenarios
  );

  assert.equal(recommendationBundle.nextBestMove.confidence, "low");
  assert.match(recommendationBundle.nextBestMove.action, /APR|minimum payment|debt details/i);
}

console.log("financial engines tests passed");
