(function initInvestmentEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createInvestmentEngine(shared) {
  const DEFAULT_ASSUMPTIONS = {
    k401: 0.07,
    roth: 0.07,
    brokerage: 0.065,
    hsa: 0.07,
    inflation: 0.025,
  };

  function analyzeInvestments(profile, options) {
    const assumptions = Object.assign({}, DEFAULT_ASSUMPTIONS, options?.assumptions || {});
    const horizons = options?.horizons || [1, 3, 5, 10, 20, 30];
    const accounts = (profile.investments || []).map((account) => {
      const annualReturn = assumptions[account.accountType] ?? assumptions.brokerage;
      const projections = horizons.reduce((map, year) => {
        map[year] = shared.futureValueWithStartingBalance(
          account.balance,
          account.recurringContribution,
          annualReturn,
          year
        );
        return map;
      }, {});

      return {
        ...account,
        annualReturn,
        projections,
      };
    });

    const totalRecurringContribution = accounts.reduce(
      (sum, account) => sum + shared.safeNumber(account.recurringContribution),
      0
    );
    const totalBalance = accounts.reduce((sum, account) => sum + shared.safeNumber(account.balance), 0);
    const totalProjection10Y = accounts.reduce(
      (sum, account) => sum + shared.safeNumber(account.projections?.[10]),
      0
    );
    const employerMatchCap = shared.safeNumber(profile.assumptions?.employerMatchCap);
    const employerMatchRate = shared.safeNumber(profile.assumptions?.employerMatchRate);
    const fourOhOne = accounts.find((account) => account.accountType === "401k");
    const matchShortfall =
      fourOhOne && employerMatchCap > 0
        ? Math.max(employerMatchCap - shared.safeNumber(fourOhOne.recurringContribution), 0)
        : 0;

    return {
      assumptions,
      accounts,
      totalRecurringContribution,
      totalBalance,
      totalProjection10Y,
      employerMatch: {
        cap: employerMatchCap,
        rate: employerMatchRate,
        shortfall: matchShortfall,
        detected: Boolean(fourOhOne),
      },
    };
  }

  return {
    analyzeInvestments,
    DEFAULT_INVESTMENT_ASSUMPTIONS: DEFAULT_ASSUMPTIONS,
  };
});
