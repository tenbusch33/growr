(function initDebtEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createDebtEngine(shared) {
  function analyzeDebt(profile, extraPayment) {
    const debts = (profile.debts || []).map((debt) => {
      const balance = shared.safeNumber(debt.balance);
      const minimumPayment = shared.safeNumber(debt.minimumPayment);
      const apr = Number(debt.apr);
      const monthlyInterest =
        Number.isFinite(apr) && apr > 0 ? shared.roundCurrency(balance * (apr / 12)) : null;
      const baselinePayoff =
        Number.isFinite(apr) && minimumPayment
          ? shared.simulateDebtPayoff(balance, apr, minimumPayment, 0)
          : { months: null, totalInterest: null };
      const acceleratedPayoff =
        Number.isFinite(apr) && minimumPayment
          ? shared.simulateDebtPayoff(balance, apr, minimumPayment, extraPayment || 0)
          : { months: null, totalInterest: null };

      return {
        ...debt,
        balance,
        apr: Number.isFinite(apr) ? apr : null,
        minimumPayment,
        monthlyInterest,
        payoffMonthsAtCurrentPayment: baselinePayoff.months,
        payoffMonthsWithExtraPayment: acceleratedPayoff.months,
        interestSavedWithExtraPayment:
          baselinePayoff.totalInterest !== null && acceleratedPayoff.totalInterest !== null
            ? shared.roundCurrency(baselinePayoff.totalInterest - acceleratedPayoff.totalInterest)
            : null,
        payoffMonthsSaved:
          baselinePayoff.months !== null && acceleratedPayoff.months !== null
            ? baselinePayoff.months - acceleratedPayoff.months
            : null,
        recommendationReady: Number.isFinite(apr) && apr > 0 && minimumPayment > 0,
      };
    });

    const knownAprDebts = debts.filter((debt) => debt.recommendationReady);
    const toxicDebt = knownAprDebts
      .filter((debt) => debt.apr > 0.18)
      .sort((left, right) => right.apr - left.apr)[0] || null;

    return {
      debts,
      toxicDebt,
      missingAprDebts: debts.filter((debt) => !debt.apr),
      totalMinimums: debts.reduce((sum, debt) => sum + shared.safeNumber(debt.minimumPayment), 0),
      totalBalance: debts.reduce((sum, debt) => sum + shared.safeNumber(debt.balance), 0),
    };
  }

  return {
    analyzeDebt,
  };
});
