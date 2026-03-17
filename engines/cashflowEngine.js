(function initCashflowEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createCashflowEngine(shared) {
  function createCashflowSnapshot(profile) {
    const monthlyIncomeNet = shared.safeNumber(profile.monthlyIncomeNet);
    const essentialSpend = shared.safeNumber(profile.monthlyEssentialSpend);
    const discretionarySpend = shared.safeNumber(profile.monthlyDiscretionarySpend);
    const debtMinimums = shared.safeNumber(profile.monthlyDebtMinimums);
    const recurringInvestments = shared.safeNumber(profile.monthlyRecurringInvestments);
    const freeCashflow = monthlyIncomeNet - essentialSpend - discretionarySpend - debtMinimums - recurringInvestments;

    return {
      monthlyIncomeNet: shared.roundCurrency(monthlyIncomeNet),
      essentialSpend: shared.roundCurrency(essentialSpend),
      discretionarySpend: shared.roundCurrency(discretionarySpend),
      debtMinimums: shared.roundCurrency(debtMinimums),
      recurringInvestments: shared.roundCurrency(recurringInvestments),
      freeCashflow: shared.roundCurrency(freeCashflow),
      savingsRate: shared.safeDivide(Math.max(freeCashflow, 0), monthlyIncomeNet),
      emergencyMonths: shared.safeDivide(profile.emergencyCash, essentialSpend + debtMinimums),
      fixedObligations: shared.roundCurrency(essentialSpend + debtMinimums),
      negativeCashflow: freeCashflow < 0 ? Math.abs(shared.roundCurrency(freeCashflow)) : 0,
    };
  }

  return {
    createCashflowSnapshot,
  };
});
