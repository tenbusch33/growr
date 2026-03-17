(function initScoreEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createScoreEngine(shared) {
  function createGrowScore(profile, cashflow, debtAnalysis, investmentAnalysis) {
    const debtLoad = shared.safeDivide(debtAnalysis.totalMinimums, cashflow.monthlyIncomeNet);
    const investingRatio = shared.safeDivide(
      investmentAnalysis.totalRecurringContribution,
      cashflow.monthlyIncomeNet
    );
    const spendingEfficiency = 1 - shared.safeDivide(cashflow.discretionarySpend, cashflow.monthlyIncomeNet);

    const subscores = {
      cashflowStability: Math.round(shared.clamp(50 + cashflow.freeCashflow / 40, 0, 100)),
      debtPressure: Math.round(shared.clamp(100 - debtLoad * 180, 0, 100)),
      emergencyStrength: Math.round(shared.clamp(cashflow.emergencyMonths * 28, 0, 100)),
      retirementCapture: Math.round(
        shared.clamp(
          investmentAnalysis.employerMatch.shortfall > 0
            ? 48
            : investmentAnalysis.totalRecurringContribution > 0
              ? 76
              : 28,
          0,
          100
        )
      ),
      investingConsistency: Math.round(shared.clamp(investingRatio * 500, 0, 100)),
      spendingEfficiency: Math.round(shared.clamp(spendingEfficiency * 100, 0, 100)),
    };

    const weighted =
      subscores.cashflowStability * 0.22 +
      subscores.debtPressure * 0.22 +
      subscores.emergencyStrength * 0.18 +
      subscores.retirementCapture * 0.14 +
      subscores.investingConsistency * 0.12 +
      subscores.spendingEfficiency * 0.12;
    const score = Math.round(shared.clamp(weighted, 0, 100));

    const drags = [];
    if (subscores.debtPressure < 55) {
      drags.push("Debt load is pulling the score down.");
    }
    if (subscores.emergencyStrength < 55) {
      drags.push("Emergency cash is still thin.");
    }
    if (subscores.retirementCapture < 55) {
      drags.push("Retirement contributions are below a strong pace.");
    }
    if (subscores.cashflowStability < 55) {
      drags.push("Monthly cash flow is too tight.");
    }

    return {
      score,
      subscores,
      drags,
    };
  }

  return {
    createGrowScore,
  };
});
