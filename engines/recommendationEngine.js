(function initRecommendationEngine(root, factory) {
  const shared =
    typeof module === "object" && module.exports
      ? require("./shared.js")
      : root.GrowrEngines;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createRecommendationEngine(shared) {
  function createRecommendation(base) {
    return Object.assign(
      {
        id: "",
        title: "",
        action: "",
        why: "",
        mathExplanation: [],
        impact: {},
        timeHorizon: "this_month",
        confidence: "low",
        assumptions: [],
        priorityScore: 0,
      },
      base
    );
  }

  function summarizeImpact(impact) {
    if (impact.interestSaved) {
      return `Estimated interest saved: $${Math.round(impact.interestSaved).toLocaleString()}`;
    }
    if (impact.monthlyCashflowDelta) {
      return `Estimated monthly cash flow change: $${Math.round(impact.monthlyCashflowDelta).toLocaleString()}`;
    }
    if (impact.projectedNetWorthDelta) {
      return `Projected 10-year net worth change: $${Math.round(impact.projectedNetWorthDelta).toLocaleString()}`;
    }
    return "Review the math before changing the plan.";
  }

  function buildRecommendations(profile, cashflow, debtAnalysis, investmentAnalysis, opportunityCost, scenarios) {
    const recommendations = [];
    const toxicDebt = debtAnalysis.toxicDebt;

    if (cashflow.freeCashflow < 0) {
      recommendations.push(
        createRecommendation({
          id: "negative-cashflow",
          title: "Close the monthly shortfall first",
          action: `Cut at least $${Math.round(Math.abs(cashflow.freeCashflow)).toLocaleString()} of flexible spending this month`,
          why: `Your current monthly cash flow is negative by about $${Math.round(Math.abs(cashflow.freeCashflow)).toLocaleString()}, so every other goal is fighting a monthly deficit.`,
          mathExplanation: [
            `Monthly income: $${Math.round(cashflow.monthlyIncomeNet).toLocaleString()}`,
            `Essential spend + debt minimums + investing: $${Math.round(cashflow.essentialSpend + cashflow.debtMinimums + cashflow.recurringInvestments).toLocaleString()}`,
            `Discretionary spend: $${Math.round(cashflow.discretionarySpend).toLocaleString()}`,
          ],
          impact: { monthlyCashflowDelta: Math.abs(cashflow.freeCashflow) },
          timeHorizon: "this_month",
          confidence: "high",
          assumptions: ["Assumes the last month of transactions reflects a normal month."],
          priorityScore: 100,
        })
      );
    }

    if (toxicDebt && cashflow.freeCashflow > 0) {
      const extra = Math.min(Math.max(cashflow.freeCashflow * 0.7, 100), 500);
      recommendations.push(
        createRecommendation({
          id: "toxic-debt-first",
          title: "Pay the highest-interest card faster",
          action: `Pay an extra $${Math.round(extra).toLocaleString()} toward ${toxicDebt.name} this month`,
          why: `${toxicDebt.name} is showing an APR of ${(toxicDebt.apr * 100).toFixed(2)}%, which is higher than Growr's baseline long-term investing return assumptions.`,
          mathExplanation: [
            `Current balance: $${Math.round(toxicDebt.balance).toLocaleString()}`,
            `Estimated monthly interest: $${Math.round(toxicDebt.monthlyInterest || 0).toLocaleString()}`,
            toxicDebt.interestSavedWithExtraPayment !== null
              ? `Adding $${Math.round(extra).toLocaleString()} could save about $${Math.round(toxicDebt.interestSavedWithExtraPayment).toLocaleString()} of interest.`
              : "APR is known, but payoff savings needs one more billing cycle of clean payment data.",
          ],
          impact: {
            interestSaved: toxicDebt.interestSavedWithExtraPayment || extra * toxicDebt.apr * 4,
            payoffMonthsSaved: toxicDebt.payoffMonthsSaved || null,
          },
          timeHorizon: "next_3_months",
          confidence: toxicDebt.recommendationReady ? "high" : "medium",
          assumptions: ["Assumes APR stays constant.", "Assumes no new charges are added to the card."],
          priorityScore: 95,
        })
      );
    } else if (debtAnalysis.missingAprDebts.length) {
      const missingDebt = debtAnalysis.missingAprDebts[0];
      const inferredRecurringInvesting = profile.monthlyRecurringInvestments > 0;
      recommendations.push(
        createRecommendation({
          id: "confirm-debt-data",
          title: "Confirm debt details before changing the plan",
          action: `Add APR and minimum payment details for ${missingDebt.name}`,
          why: "Growr found debt, but the interest rate is missing, so it cannot confidently compare debt payoff versus investing yet.",
          mathExplanation: [
            `Known debt balance: $${Math.round(missingDebt.balance).toLocaleString()}`,
            "APR is missing, so the long-term interest drag cannot be modeled confidently.",
            inferredRecurringInvesting
              ? `Recurring investing detected: about $${Math.round(profile.monthlyRecurringInvestments).toLocaleString()} per month.`
              : "No recurring investing was detected from the current data.",
          ],
          impact: {},
          timeHorizon: "this_month",
          confidence: "low",
          assumptions: ["Recommendation confidence will improve after APR and minimum payment are confirmed."],
          priorityScore: inferredRecurringInvesting ? 96 : 90,
        })
      );
    }

    if (investmentAnalysis.employerMatch.shortfall > 0 && cashflow.freeCashflow > 0) {
      recommendations.push(
        createRecommendation({
          id: "capture-match",
          title: "Capture the full 401(k) match first",
          action: `Raise your 401(k) contribution by $${Math.round(investmentAnalysis.employerMatch.shortfall).toLocaleString()} per month`,
          why: "Employer match money is an immediate guaranteed return and should usually come before extra brokerage investing.",
          mathExplanation: [
            `Current recurring investing: $${Math.round(investmentAnalysis.totalRecurringContribution).toLocaleString()} per month`,
            `Employer match shortfall: $${Math.round(investmentAnalysis.employerMatch.shortfall).toLocaleString()} per month`,
          ],
          impact: {
            projectedNetWorthDelta: shared.futureValueOfMonthly(
              investmentAnalysis.employerMatch.shortfall,
              0.07,
              10
            ),
          },
          timeHorizon: "next_12_months",
          confidence: "medium",
          assumptions: ["Assumes the employer match threshold entered in Growr is accurate."],
          priorityScore: 88,
        })
      );
    }

    if (cashflow.emergencyMonths < 1) {
      const targetAmount = Math.max(cashflow.essentialSpend + cashflow.debtMinimums - profile.emergencyCash, 0);
      recommendations.push(
        createRecommendation({
          id: "emergency-buffer",
          title: "Build one month of emergency cash",
          action: `Direct the next $${Math.round(targetAmount).toLocaleString()} into cash reserves`,
          why: "You have less than one month of essential expenses set aside, which makes every surprise expense more expensive.",
          mathExplanation: [
            `Emergency cash: $${Math.round(profile.emergencyCash).toLocaleString()}`,
            `One month of essentials + debt minimums: $${Math.round(cashflow.essentialSpend + cashflow.debtMinimums).toLocaleString()}`,
          ],
          impact: { monthlyCashflowDelta: 0 },
          timeHorizon: "next_3_months",
          confidence: "high",
          assumptions: ["Assumes current essential spending is stable."],
          priorityScore: 84,
        })
      );
    }

    if (profile.monthlySubscriptions > 50) {
      recommendations.push(
        createRecommendation({
          id: "subscription-cleanup",
          title: "Review recurring charges",
          action: `Review about $${Math.round(profile.monthlySubscriptions).toLocaleString()} per month of subscriptions and recurring charges`,
          why: "Recurring charges are one of the easiest places to free up cash without disrupting core bills.",
          mathExplanation: [
            `Detected subscriptions: $${Math.round(profile.monthlySubscriptions).toLocaleString()} per month`,
            `15-year opportunity cost: $${Math.round(opportunityCost.biggest.futureValue).toLocaleString()}`,
          ],
          impact: {
            projectedNetWorthDelta: opportunityCost.biggest.futureValue,
            monthlyCashflowDelta: profile.monthlySubscriptions,
          },
          timeHorizon: "next_3_months",
          confidence: profile.subscriptions.length >= 2 ? "medium" : "low",
          assumptions: ["Assumes Growr categorized the recurring merchants correctly. Review before acting."],
          priorityScore: 70,
        })
      );
    }

    recommendations.sort((left, right) => right.priorityScore - left.priorityScore);

    return {
      recommendations,
      nextBestMove: recommendations[0] || null,
      summarizeImpact,
      scenarioPreview: scenarios.optimized,
    };
  }

  return {
    buildRecommendations,
  };
});
