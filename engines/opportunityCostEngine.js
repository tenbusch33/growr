(function initOpportunityCostEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createOpportunityCostEngine(shared) {
  function analyzeOpportunityCost(profile, cashflow) {
    const candidates = [
      {
        id: "subscriptions",
        title: "What recurring subscriptions could become",
        monthlyAmount: shared.safeNumber(profile.monthlySubscriptions),
        horizonYears: 15,
        annualReturn: 0.065,
        reason: "Recurring subscriptions feel small, but they compound if redirected into investing.",
      },
      {
        id: "discretionary",
        title: "What flexible spending could become",
        monthlyAmount: shared.roundCurrency(Math.max(shared.safeNumber(cashflow.discretionarySpend) * 0.2, 0)),
        horizonYears: 15,
        annualReturn: 0.065,
        reason: "A partial trim to flexible spending can become meaningful invested dollars.",
      },
      {
        id: "car",
        title: "What the current car load could become",
        monthlyAmount: shared.roundCurrency(Math.max(shared.safeNumber(profile.monthlyEssentialSpend) * 0.18, 0)),
        horizonYears: 20,
        annualReturn: 0.065,
        reason: "Vehicle costs often crowd out both debt payoff and long-term investing for years.",
      },
    ]
      .filter((candidate) => candidate.monthlyAmount > 0)
      .map((candidate) => ({
        ...candidate,
        futureValue: shared.futureValueOfMonthly(
          candidate.monthlyAmount,
          candidate.annualReturn,
          candidate.horizonYears
        ),
      }));

    const biggest =
      candidates.sort((left, right) => right.futureValue - left.futureValue)[0] || {
        id: "none",
        title: "What this really costs",
        monthlyAmount: 0,
        futureValue: 0,
        horizonYears: 15,
        reason: "Growr needs more recurring cost data before it can surface the biggest long-term tradeoff.",
      };

    return {
      biggest,
      candidates,
    };
  }

  return {
    analyzeOpportunityCost,
  };
});
