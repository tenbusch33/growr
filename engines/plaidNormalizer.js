(function initPlaidNormalizer(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaidNormalizer(shared) {
  const ESSENTIAL_CATEGORIES = new Set([
    "housing",
    "utilities",
    "groceries",
    "insurance",
    "transportation",
    "auto and transport",
    "medical",
    "health and wellness",
    "education",
    "taxes",
    "legal",
    "pets",
    "home and garden",
    "bills and utilities",
  ]);

  const DISCRETIONARY_CATEGORIES = new Set([
    "restaurants",
    "dining and drinks",
    "shopping",
    "entertainment",
    "entertainment & rec",
    "travel",
    "travel and vacation",
    "personal care",
    "business",
    "donations",
    "cash/atm/checks",
    "uncategorized",
    "other",
    "fun",
  ]);

  function normalizeCategory(value) {
    return String(value || "").trim().toLowerCase();
  }

  function classifyTransaction(entry) {
    const category = normalizeCategory(entry.category);
    const amount = Math.abs(shared.safeNumber(entry.amount));
    const isIncome = shared.safeNumber(entry.amount) < 0;
    if (!amount) {
      return null;
    }
    if (isIncome) {
      return { type: "income", amount };
    }
    if (ESSENTIAL_CATEGORIES.has(category)) {
      return { type: "essential", amount };
    }
    if (DISCRETIONARY_CATEGORIES.has(category)) {
      return { type: "discretionary", amount };
    }
    if (category === "debt" || category === "loan payments" || category === "cc payment") {
      return { type: "debt", amount };
    }
    return { type: "discretionary", amount };
  }

  function getTransactionDate(entry) {
    const rawValue =
      entry?.date || entry?.authorizedDate || entry?.authorized_date || entry?.postedDate || entry?.transactionDate;
    const date = rawValue ? new Date(rawValue) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function getRecentTransactions(transactions) {
    const datedTransactions = transactions
      .map((entry) => ({ entry, date: getTransactionDate(entry) }))
      .filter((item) => item.date);

    if (!datedTransactions.length) {
      return {
        transactions,
        observedDays: 30,
        coverage: "low",
      };
    }

    const latestTimestamp = Math.max(...datedTransactions.map((item) => item.date.getTime()));
    const earliestAllowed = latestTimestamp - 34 * 24 * 60 * 60 * 1000;
    const windowed = datedTransactions.filter((item) => item.date.getTime() >= earliestAllowed);
    const timestamps = windowed.map((item) => item.date.getTime());
    const observedDays = Math.max(
      1,
      Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000)) + 1
    );
    const coverage =
      windowed.length >= 8 && observedDays >= 21
        ? "high"
        : windowed.length >= 4 && observedDays >= 14
          ? "medium"
          : "low";

    return {
      transactions: windowed.map((item) => item.entry),
      observedDays,
      coverage,
    };
  }

  function createMonthlyizedTransactionBuckets(transactions) {
    const recentWindow = getRecentTransactions(transactions);
    const discretionaryBreakdown = {};
    const monthTotals = new Map();

    recentWindow.transactions.forEach((entry) => {
      const date = getTransactionDate(entry);
      const monthKey = date
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
        : "unknown";
      if (!monthTotals.has(monthKey)) {
        monthTotals.set(monthKey, {
          income: 0,
          essential: 0,
          debt: 0,
          discretionary: 0,
          discretionaryBreakdown: {},
        });
      }

      const result = classifyTransaction(entry);
      if (!result) {
        return;
      }

      const bucket = monthTotals.get(monthKey);
      bucket[result.type] += result.amount;

      if (result.type === "discretionary") {
        const categoryKey = normalizeCategory(entry.category) || "other";
        bucket.discretionaryBreakdown[categoryKey] =
          (bucket.discretionaryBreakdown[categoryKey] || 0) + result.amount;
      }
    });

    const observedMonths = Math.max(monthTotals.size, 1);
    monthTotals.forEach((bucket) => {
      Object.entries(bucket.discretionaryBreakdown).forEach(([categoryKey, amount]) => {
        discretionaryBreakdown[categoryKey] = (discretionaryBreakdown[categoryKey] || 0) + amount;
      });
    });

    const rawBuckets = Array.from(monthTotals.values()).reduce(
      (accumulator, bucket) => ({
        monthlyIncomeNet: accumulator.monthlyIncomeNet + bucket.income / observedMonths,
        monthlyEssentialSpend: accumulator.monthlyEssentialSpend + bucket.essential / observedMonths,
        monthlyDebtPayments: accumulator.monthlyDebtPayments + bucket.debt / observedMonths,
        monthlyDiscretionarySpend:
          accumulator.monthlyDiscretionarySpend + bucket.discretionary / observedMonths,
      }),
      {
        monthlyIncomeNet: 0,
        monthlyEssentialSpend: 0,
        monthlyDiscretionarySpend: 0,
        monthlyDebtPayments: 0,
      }
    );

    const monthlyDiscretionaryBreakdown = Object.entries(discretionaryBreakdown)
      .map(([category, amount]) => ({
        category,
        monthlyAmount: shared.roundCurrency(amount / observedMonths),
      }))
      .filter((entry) => entry.monthlyAmount > 0)
      .sort((left, right) => right.monthlyAmount - left.monthlyAmount);

    return {
      monthlyIncomeNet: shared.roundCurrency(rawBuckets.monthlyIncomeNet),
      monthlyEssentialSpend: shared.roundCurrency(rawBuckets.monthlyEssentialSpend),
      monthlyDiscretionarySpend: shared.roundCurrency(rawBuckets.monthlyDiscretionarySpend),
      monthlyDebtPayments: shared.roundCurrency(rawBuckets.monthlyDebtPayments),
      monthlyDiscretionaryBreakdown,
      observedDays: recentWindow.observedDays,
      coverage: recentWindow.coverage,
    };
  }

  function inferRecurringTransfers(investmentInputs) {
    return [
      {
        id: "401k",
        label: "401(k)",
        monthlyAmount: shared.safeNumber(investmentInputs.k401Contribution),
        annualReturn: 0.07,
        confidence: shared.safeNumber(investmentInputs.k401Contribution) ? "high" : "low",
        assumptions: shared.safeNumber(investmentInputs.k401Contribution)
          ? []
          : ["No recurring 401(k) contribution was entered."],
      },
      {
        id: "roth",
        label: "Roth IRA",
        monthlyAmount: shared.safeNumber(investmentInputs.rothContribution),
        annualReturn: 0.07,
        confidence: shared.safeNumber(investmentInputs.rothContribution) ? "high" : "low",
        assumptions: shared.safeNumber(investmentInputs.rothContribution)
          ? []
          : ["No recurring Roth IRA contribution was entered."],
      },
      {
        id: "brokerage",
        label: "Brokerage",
        monthlyAmount: shared.safeNumber(investmentInputs.brokerageContribution),
        annualReturn: 0.065,
        confidence: shared.safeNumber(investmentInputs.brokerageContribution) ? "high" : "low",
        assumptions: shared.safeNumber(investmentInputs.brokerageContribution)
          ? []
          : ["No recurring brokerage contribution was entered."],
      },
      {
        id: "hsa",
        label: "HSA",
        monthlyAmount: shared.safeNumber(investmentInputs.hsaContribution),
        annualReturn: 0.07,
        confidence: shared.safeNumber(investmentInputs.hsaContribution) ? "high" : "low",
        assumptions: shared.safeNumber(investmentInputs.hsaContribution)
          ? []
          : ["No recurring HSA contribution was entered."],
      },
    ].filter((entry) => entry.monthlyAmount > 0);
  }

  function normalizeFinancialProfile(input) {
    const planner = input.planner || {};
    const linkedSummary = input.linkedSummary || {};
    const transactions = Array.isArray(input.transactions) ? input.transactions : [];
    const subscriptions = Array.isArray(input.subscriptions) ? input.subscriptions : [];
    const recurringBills = Array.isArray(input.recurringBills) ? input.recurringBills : [];
    const recurringIncome = Array.isArray(input.recurringIncome) ? input.recurringIncome : [];
    const investmentInputs = input.investmentInputs || {};
    const hasInvestmentAccess = Boolean(input.hasInvestmentAccess);

    const transactionBuckets = createMonthlyizedTransactionBuckets(transactions);

    const plannerIncome = shared.safeNumber(planner.income);
    const plannerEssential = shared.safeNumber(planner.housing) + shared.safeNumber(planner.essentials) + shared.safeNumber(planner.carCosts);
    const plannerDebtMinimums =
      shared.safeNumber(planner.creditCardPayment) +
      shared.safeNumber(planner.otherDebt) +
      shared.safeNumber(planner.carPayment);

    const monthlySubscriptions = subscriptions.reduce(
      (sum, entry) => sum + shared.safeNumber(entry.monthlyEstimate || entry.amount),
      0
    );
    const monthlyBills = recurringBills.reduce(
      (sum, entry) => sum + shared.safeNumber(entry.monthlyEstimate || entry.amount),
      0
    );

    const investments = hasInvestmentAccess
      ? [
          {
            id: "401k",
            label: "401(k)",
            balance: shared.safeNumber(investmentInputs.k401Balance),
            recurringContribution: shared.safeNumber(investmentInputs.k401Contribution),
            annualReturnAssumption: 0.07,
            accountType: "401k",
          },
          {
            id: "roth",
            label: "Roth IRA",
            balance: shared.safeNumber(investmentInputs.rothBalance),
            recurringContribution: shared.safeNumber(investmentInputs.rothContribution),
            annualReturnAssumption: 0.07,
            accountType: "roth",
          },
          {
            id: "brokerage",
            label: "Brokerage",
            balance: shared.safeNumber(investmentInputs.brokerageBalance),
            recurringContribution: shared.safeNumber(investmentInputs.brokerageContribution),
            annualReturnAssumption: 0.065,
            accountType: "brokerage",
          },
          {
            id: "hsa",
            label: "HSA",
            balance: shared.safeNumber(investmentInputs.hsaBalance),
            recurringContribution: shared.safeNumber(investmentInputs.hsaContribution),
            annualReturnAssumption: 0.07,
            accountType: "hsa",
          },
        ].filter((account) => account.balance || account.recurringContribution)
      : [];

    const linkedLiabilities = Array.isArray(linkedSummary.liabilities) ? linkedSummary.liabilities : [];
    const debts = [];

    if (shared.safeNumber(planner.creditCardBalance) || linkedSummary.creditCardDebt) {
      debts.push({
        id: "credit-card-primary",
        name: "Credit card debt",
        type: "credit_card",
        balance: Math.max(shared.safeNumber(planner.creditCardBalance), shared.safeNumber(linkedSummary.creditCardDebt)),
        apr: null,
        minimumPayment: shared.safeNumber(planner.creditCardPayment),
        institution: null,
        dueDate: null,
        metadataMissing: ["APR"],
      });
    }

    if (shared.safeNumber(planner.carLoanBalance)) {
      debts.push({
        id: "auto-loan-primary",
        name: "Auto loan",
        type: "auto_loan",
        balance: shared.safeNumber(planner.carLoanBalance),
        apr: null,
        minimumPayment: shared.safeNumber(planner.carPayment),
        institution: null,
        dueDate: null,
        metadataMissing: ["APR"],
      });
    }

    linkedLiabilities.forEach((entry, index) => {
      const typeMap = {
        "Credit card": "credit_card",
        Mortgage: "mortgage",
        "Student loan": "student_loan",
      };
      debts.push({
        id: `plaid-debt-${index}`,
        name: entry.name || entry.kind || "Debt account",
        type: typeMap[entry.kind] || "other_debt",
        balance: shared.safeNumber(entry.amount),
        apr: shared.safeNumber(entry.apr || 0) || null,
        minimumPayment: shared.safeNumber(entry.minimumPayment || 0) || null,
        institution: entry.institution?.name || entry.institution || null,
        dueDate: entry.dueDate || null,
        metadataMissing: [
          ...(entry.apr ? [] : ["APR"]),
          ...(entry.minimumPayment ? [] : ["Minimum payment"]),
        ],
      });
    });

    const recurringIncomeEstimate = recurringIncome.reduce(
      (sum, entry) => sum + shared.safeNumber(entry.estimatedMonthlyIncome),
      0
    );
    const linkedDebtMinimums = debts.reduce(
      (sum, debt) => sum + shared.safeNumber(debt.minimumPayment),
      0
    );
    const transactionCoverageStrong = transactionBuckets.coverage === "high";
    const transactionCoverageUsable = transactionBuckets.coverage !== "low";
    const monthlyIncomeNet = Math.max(
      recurringIncomeEstimate,
      transactionCoverageUsable ? transactionBuckets.monthlyIncomeNet : 0,
      plannerIncome
    );
    const monthlyEssentialSpend = transactionCoverageStrong
      ? transactionBuckets.monthlyEssentialSpend
      : Math.max(transactionBuckets.monthlyEssentialSpend, plannerEssential, monthlyBills);
    const monthlyDiscretionarySpend = transactionCoverageUsable
      ? transactionBuckets.monthlyDiscretionarySpend
      : Math.max(monthlySubscriptions, 0);
    const monthlyDebtMinimums =
      plannerDebtMinimums ||
      linkedDebtMinimums ||
      (transactionCoverageUsable ? transactionBuckets.monthlyDebtPayments : 0);

    return {
      monthlyIncomeNet,
      monthlyEssentialSpend,
      monthlyDiscretionarySpend,
      monthlyDebtMinimums,
      monthlyRecurringInvestments: investments.reduce(
        (sum, account) => sum + shared.safeNumber(account.recurringContribution),
        0
      ),
      monthlySubscriptions,
      monthlyBills,
      emergencyCash: Math.max(
        shared.safeNumber(planner.emergencyFund),
        shared.safeNumber(linkedSummary.cashTotal),
        shared.safeNumber(planner.cashAssets)
      ),
      debts,
      investments,
      recurringTransfers: inferRecurringTransfers(investmentInputs),
      recurringIncome,
      subscriptions,
      recurringBills,
      transactions,
      monthlyDiscretionaryBreakdown: transactionBuckets.monthlyDiscretionaryBreakdown,
      linkedAccounts: linkedSummary.accounts || [],
      netWorth: shared.safeNumber(input.netWorth),
      assumptions: {
        inflation: 0.025,
        employerMatchRate: shared.safeNumber(planner.employerMatchRate),
        employerMatchCap: shared.safeNumber(planner.employerMatchCap),
        age: shared.safeNumber(investmentInputs.age),
        retirementAge: shared.safeNumber(investmentInputs.retirementAge),
        retirementMonthlyGoal: shared.safeNumber(investmentInputs.retirementMonthlyGoal),
        retirementIncomeOther: shared.safeNumber(investmentInputs.retirementIncomeOther),
        transactionWindowDays: transactionBuckets.observedDays,
        transactionCoverage: transactionBuckets.coverage,
      },
    };
  }

  return {
    normalizeFinancialProfile,
  };
});
