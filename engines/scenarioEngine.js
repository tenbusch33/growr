(function initScenarioEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createScenarioEngine(shared) {
  function buildScenario(name, profile, cashflow, debtAnalysis, monthlyRedirect) {
    const debtTargets = debtAnalysis.debts.filter((debt) => debt.apr && debt.minimumPayment);
    const topDebt = debtTargets.sort((left, right) => (right.apr || 0) - (left.apr || 0))[0];
    const redirect = shared.safeNumber(monthlyRedirect);

    return {
      name,
      cashPosition12M: shared.roundCurrency(cashflow.freeCashflow * 12 + redirect * 12),
      debtPayoffDate:
        topDebt && topDebt.payoffMonthsAtCurrentPayment !== null
          ? `${Math.max(topDebt.payoffMonthsAtCurrentPayment - Math.round(redirect / 100), 1)} months`
          : "Needs debt APR + minimums",
      totalInterestPaid:
        topDebt && topDebt.interestSavedWithExtraPayment !== null
          ? shared.roundCurrency((topDebt.interestSavedWithExtraPayment || 0) * -1)
          : null,
      projectedNetWorth5Y: shared.roundCurrency(
        shared.safeNumber(profile.netWorth) + shared.futureValueOfMonthly(redirect, 0.065, 5)
      ),
      projectedNetWorth10Y: shared.roundCurrency(
        shared.safeNumber(profile.netWorth) + shared.futureValueOfMonthly(redirect, 0.065, 10)
      ),
      yearlyBenefit: shared.roundCurrency(redirect * 12),
    };
  }

  function analyzeScenarios(profile, cashflow, debtAnalysis, investmentAnalysis) {
    const freeCash = Math.max(cashflow.freeCashflow, 0);
    const currentPlan = buildScenario("Current plan", profile, cashflow, debtAnalysis, 0);
    const debtFirstPlan = buildScenario("Debt-first plan", profile, cashflow, debtAnalysis, Math.min(freeCash, 300));
    const emergencyFirstPlan = buildScenario("Emergency-first plan", profile, cashflow, debtAnalysis, Math.min(freeCash, 200));
    const higherInvestingPlan = buildScenario("Higher investing plan", profile, cashflow, debtAnalysis, Math.min(freeCash, 250));
    const matchFirstPlan = buildScenario(
      "Employer-match-first plan",
      profile,
      cashflow,
      debtAnalysis,
      Math.min(Math.max(investmentAnalysis.employerMatch.shortfall, 0), freeCash)
    );
    const optimized = [debtFirstPlan, emergencyFirstPlan, higherInvestingPlan, matchFirstPlan]
      .slice()
      .sort((left, right) => right.projectedNetWorth10Y - left.projectedNetWorth10Y)[0];

    return {
      currentPlan,
      debtFirstPlan,
      emergencyFirstPlan,
      higherInvestingPlan,
      matchFirstPlan,
      optimized,
    };
  }

  return {
    analyzeScenarios,
  };
});
