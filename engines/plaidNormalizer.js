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

    const transactionBuckets = transactions.reduce(
      (accumulator, entry) => {
        const result = classifyTransaction(entry);
        if (!result) {
          return accumulator;
        }
        if (result.type === "income") {
          accumulator.monthlyIncomeNet += result.amount;
        } else if (result.type === "essential") {
          accumulator.monthlyEssentialSpend += result.amount;
        } else if (result.type === "debt") {
          accumulator.monthlyDebtMinimums += result.amount;
        } else {
          accumulator.monthlyDiscretionarySpend += result.amount;
        }
        return accumulator;
      },
      {
        monthlyIncomeNet: 0,
        monthlyEssentialSpend: 0,
        monthlyDiscretionarySpend: 0,
        monthlyDebtMinimums: 0,
      }
    );

    const plannerIncome = shared.safeNumber(planner.income);
    const plannerEssential = shared.safeNumber(planner.housing) + shared.safeNumber(planner.essentials) + shared.safeNumber(planner.carCosts);
    const plannerDebtMinimums =
      shared.safeNumber(planner.creditCardPayment) +
      shared.safeNumber(planner.otherDebt) +
      shared.safeNumber(planner.carPayment);

    const monthlyIncomeNet =
      recurringIncome.reduce((sum, entry) => sum + shared.safeNumber(entry.estimatedMonthlyIncome), 0) ||
      transactionBuckets.monthlyIncomeNet ||
      plannerIncome;

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

    return {
      monthlyIncomeNet,
      monthlyEssentialSpend: transactionBuckets.monthlyEssentialSpend || plannerEssential || monthlyBills,
      monthlyDiscretionarySpend: transactionBuckets.monthlyDiscretionarySpend || Math.max(monthlySubscriptions, 0),
      monthlyDebtMinimums: transactionBuckets.monthlyDebtMinimums || plannerDebtMinimums,
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
      },
    };
  }

  return {
    normalizeFinancialProfile,
  };
});
