(function initShared(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GrowrEngines = Object.assign(root.GrowrEngines || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function createShared() {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
  }

  function roundCurrency(value) {
    return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function futureValueOfMonthly(monthlyAmount, annualReturn, years) {
    const monthlyRate = annualReturn / 12;
    const months = Math.max(Math.round(years * 12), 0);
    let total = 0;

    for (let index = 0; index < months; index += 1) {
      total = total * (1 + monthlyRate) + safeNumber(monthlyAmount);
    }

    return roundCurrency(total);
  }

  function futureValueWithStartingBalance(balance, monthlyAmount, annualReturn, years) {
    const monthlyRate = annualReturn / 12;
    const months = Math.max(Math.round(years * 12), 0);
    let total = safeNumber(balance);

    for (let index = 0; index < months; index += 1) {
      total = total * (1 + monthlyRate) + safeNumber(monthlyAmount);
    }

    return roundCurrency(total);
  }

  function simulateDebtPayoff(balance, apr, monthlyPayment, extraPayment, capMonths) {
    const startingBalance = safeNumber(balance);
    const basePayment = safeNumber(monthlyPayment);
    const extra = safeNumber(extraPayment);
    const annualRate = Number(apr);
    const monthsCap = capMonths || 600;

    if (!startingBalance || !basePayment || !Number.isFinite(annualRate) || annualRate < 0) {
      return {
        months: null,
        totalInterest: null,
        totalPaid: null,
        monthlyInterest: null,
        paidOff: false,
      };
    }

    const monthlyRate = annualRate / 12;
    let remaining = startingBalance;
    let totalInterest = 0;
    let months = 0;

    while (remaining > 0.01 && months < monthsCap) {
      const interest = remaining * monthlyRate;
      const payment = Math.min(remaining + interest, basePayment + extra);
      if (payment <= interest) {
        return {
          months: null,
          totalInterest: null,
          totalPaid: null,
          monthlyInterest: roundCurrency(startingBalance * monthlyRate),
          paidOff: false,
        };
      }
      remaining = remaining + interest - payment;
      totalInterest += interest;
      months += 1;
    }

    return {
      months: remaining <= 0.01 ? months : null,
      totalInterest: remaining <= 0.01 ? roundCurrency(totalInterest) : null,
      totalPaid: remaining <= 0.01 ? roundCurrency(startingBalance + totalInterest) : null,
      monthlyInterest: roundCurrency(startingBalance * monthlyRate),
      paidOff: remaining <= 0.01,
    };
  }

  return {
    clamp,
    safeNumber,
    safeDivide,
    roundCurrency,
    futureValueOfMonthly,
    futureValueWithStartingBalance,
    simulateDebtPayoff,
  };
});
