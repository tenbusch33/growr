const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const returns = {
  k401: 0.1,
  roth: 0.1,
  traditionalIra: 0.1,
  hsa: 0.09,
  college529: 0.08,
  brokerage: 0.08,
};

const state = {
  config: null,
  currentPage: "snapshot",
  plaidHandler: null,
  user: null,
  saveTimer: null,
  transactions: [],
  transactionFilters: {
    category: "all",
    source: "all",
    search: "",
  },
};

const budgetDefaults = {
  age: 32,
  k401Balance: 28000,
  k401Contribution: 500,
  rothBalance: 12000,
  rothContribution: 250,
  traditionalIraBalance: 6000,
  traditionalIraContribution: 150,
  hsaBalance: 3500,
  hsaContribution: 120,
  college529Balance: 4000,
  college529Contribution: 100,
  brokerageBalance: 8000,
  brokerageContribution: 300,
  forecastYears: 10,
};

const chartPalette = {
  housing: "linear-gradient(180deg, #3867ff, #6c8cff)",
  essentials: "linear-gradient(180deg, #00b894, #44d7b6)",
  debt: "linear-gradient(180deg, #ff5a36, #ff8b70)",
  car: "linear-gradient(180deg, #ff4fa1, #ff82bd)",
  leftover: "linear-gradient(180deg, #ffd33d, #ffe27e)",
  k401: "linear-gradient(90deg, #3867ff, #6c8cff)",
  roth: "linear-gradient(90deg, #00b894, #60e0c6)",
  traditionalIra: "linear-gradient(90deg, #14b8ff, #74d7ff)",
  hsa: "linear-gradient(90deg, #7c4dff, #a281ff)",
  college529: "linear-gradient(90deg, #ff9f1c, #ffd166)",
  brokerage: "linear-gradient(90deg, #ff4fa1, #ff8cc4)",
  fun: "linear-gradient(180deg, #7c4dff, #a281ff)",
  other: "linear-gradient(180deg, #64748b, #94a3b8)",
};

const categoryTargets = [
  { key: "housing", label: "Housing", target: 2100, color: chartPalette.housing },
  { key: "essentials", label: "Essentials", target: 850, color: chartPalette.essentials },
  { key: "debt", label: "Debt", target: 750, color: chartPalette.debt },
  { key: "car", label: "Car", target: 1065, color: chartPalette.car },
  { key: "fun", label: "Fun", target: 400, color: chartPalette.fun },
  { key: "other", label: "Other", target: 300, color: chartPalette.other },
];

function getValue(id) {
  return Number(document.getElementById(id).value) || 0;
}

function setValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = value;
  }
}

function futureValue(balance, monthlyContribution, annualReturn, years) {
  const monthlyRate = annualReturn / 12;
  const months = years * 12;
  let total = balance;

  for (let index = 0; index < months; index += 1) {
    total = total * (1 + monthlyRate) + monthlyContribution;
  }

  return total;
}

function getAllocation(age) {
  if (age < 30) {
    return {
      title: "Growth-forward mix",
      stocks: 90,
      bonds: 10,
      note: "A longer runway can usually handle more stock exposure, especially in broad index funds.",
      funds: ["S&P 500 index fund", "Total market index fund", "International index fund"],
    };
  }

  if (age < 45) {
    return {
      title: "Balanced growth mix",
      stocks: 80,
      bonds: 20,
      note: "Still growth-oriented, but with a little more stability as responsibilities increase.",
      funds: ["Target-date fund", "Total market fund", "US bond index fund"],
    };
  }

  if (age < 60) {
    return {
      title: "Moderate risk mix",
      stocks: 70,
      bonds: 30,
      note: "This mix aims to keep growth alive while reducing drawdown risk as retirement gets closer.",
      funds: ["Target-date fund", "Dividend or total market fund", "Bond index fund"],
    };
  }

  return {
    title: "Capital preservation mix",
    stocks: 55,
    bonds: 45,
    note: "Focus shifts more toward preserving flexibility and limiting sharp swings near retirement.",
    funds: ["Conservative target-date fund", "Short-term bond fund", "Broad US equity fund"],
  };
}

function buildRecommendations(snapshot) {
  const items = [];

  if (snapshot.leftover < 0) {
    items.push({
      level: "alert",
      title: "Spending is above monthly income",
      body: "Cut discretionary spending immediately and consider pausing brokerage contributions until monthly cash flow turns positive.",
    });
  }

  if (
    snapshot.creditCardBalance > 0 &&
    snapshot.leftover > 0 &&
    snapshot.creditCardPayment < snapshot.creditCardBalance * 0.03
  ) {
    items.push({
      level: "alert",
      title: "Credit card payoff is moving too slowly",
      body: "Redirect some investing toward the credit card balance first. High-interest debt usually beats market returns in urgency.",
    });
  }

  if (snapshot.carRatio > 0.18) {
    items.push({
      level: "warn",
      title: "Car costs look heavy for this income",
      body: "A large car payment plus operating costs can crowd out debt payoff and savings. Consider refinancing, selling, or choosing a lower-cost vehicle path.",
    });
  }

  if (snapshot.emergencyMonths < 1) {
    items.push({
      level: "warn",
      title: "Emergency savings is thin",
      body: "Build at least one month of essential expenses before pushing extra money into a taxable brokerage account.",
    });
  }

  if (snapshot.leftover > 500 && snapshot.creditCardBalance === 0) {
    items.push({
      level: "good",
      title: "Cash flow can support stronger investing",
      body: "With positive monthly margin and no credit card balance, consider increasing retirement contributions toward 15% of income.",
    });
  }

  if (items.length === 0) {
    items.push({
      level: "good",
      title: "Plan looks reasonably stable",
      body: "Keep refining spending categories and raise investing gradually as income grows or debts shrink.",
    });
  }

  return items;
}

function renderRecommendations(items) {
  const container = document.getElementById("recommendations");
  container.innerHTML = items
    .map(
      (item) => `
        <article class="recommendation-item ${item.level}">
          <h3>${item.title}</h3>
          <p>${item.body}</p>
        </article>
      `
    )
    .join("");
}

function updateIntegrationStatus(config) {
  document.getElementById("auth-status").textContent = config.supabaseConfigured
    ? "Connected"
    : "Demo mode";
  document.getElementById("billing-status").textContent =
    config.stripeApiConfigured || (config.stripeBudgetConfigured && config.stripeBundleConfigured)
      ? "Connected"
      : "Demo mode";
}

function setAuthMessage(text) {
  const message = document.getElementById("auth-message");
  message.classList.remove("hidden");
  message.textContent = text;
}

function renderHeroState() {
  const hero = document.querySelector(".hero");
  if (!hero) {
    return;
  }

  const shouldCompact = state.currentPage !== "snapshot" || Boolean(state.user);
  hero.classList.toggle("hero-compact", shouldCompact);
}

function setActivePage(page) {
  const nextPage = document.querySelector(`.app-page[data-page="${page}"]`) ? page : "snapshot";
  state.currentPage = nextPage;
  document.querySelectorAll(".app-page").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === nextPage);
  });
  document.querySelectorAll("[data-page-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pageTarget === nextPage);
  });
  if (window.location.hash !== `#${nextPage}`) {
    window.history.replaceState({}, "", `#${nextPage}`);
  }
  renderHeroState();
}

function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (checkout === "success") {
    setAuthMessage("Checkout completed. Your free trial and subscription status will update as Stripe confirms payment.");
  } else if (checkout === "cancel") {
    setAuthMessage("Checkout was canceled. You can try again whenever you are ready.");
  }
}

function setPlannerStatus(text) {
  document.getElementById("planner-status").textContent = text;
}

function setTransactionStatus(text) {
  document.getElementById("transaction-status").textContent = text;
}

function setAccountStatus(text) {
  document.getElementById("account-status").textContent = text;
}

function hasInvestmentAccess() {
  return Boolean(state.user && state.user.plan === "bundle" && state.user.subscriptionActive !== false);
}

function formatTrialMessage(user = state.user) {
  if (!user?.trialActive) {
    return user?.subscriptionActive === false ? "Billing pending" : "Paid plan";
  }

  const daysRemaining = Math.max(Number(user.trialDaysRemaining || 0), 0);
  return daysRemaining <= 1 ? "Trial ends soon" : `${daysRemaining} trial days left`;
}

function populateAccountForm() {
  const nameInput = document.getElementById("accountFullName");
  const emailInput = document.getElementById("accountEmail");
  const saveButton = document.getElementById("account-save-button");
  const billingButton = document.getElementById("account-billing-button");
  const logoutButton = document.getElementById("account-logout-button");
  const planLabel = document.getElementById("accountPlanLabel");
  const trialLabel = document.getElementById("accountTrialLabel");
  const subscriptionLabel = document.getElementById("accountSubscriptionLabel");

  if (!state.user) {
    nameInput.value = "";
    emailInput.value = "";
    nameInput.disabled = true;
    emailInput.disabled = true;
    saveButton.disabled = true;
    billingButton.disabled = true;
    logoutButton.disabled = true;
    planLabel.textContent = "Signed out";
    trialLabel.textContent = "Unavailable";
    subscriptionLabel.textContent = "Unavailable";
    setAccountStatus("Sign in to update your account details.");
    return;
  }

  nameInput.disabled = false;
  emailInput.disabled = false;
  saveButton.disabled = false;
  billingButton.disabled = !state.config?.stripeApiConfigured;
  logoutButton.disabled = false;
  nameInput.value = state.user.fullName || "";
  emailInput.value = state.user.email || "";
  planLabel.textContent = state.user.plan === "bundle" ? "Budget + Investing" : "Budget Core";
  trialLabel.textContent = state.user.trialActive
    ? `${Math.max(Number(state.user.trialDaysRemaining || 0), 0)} days left`
    : "No active trial";
  subscriptionLabel.textContent = state.user.subscriptionActive === false ? "Pending" : "Active";
  setAccountStatus(
    state.user.trialActive
      ? `Signed in. Your free trial ends ${new Date(state.user.trialEndsAt).toLocaleDateString()}.`
      : "Signed in. Update your profile or manage your subscription here."
  );
}

function getPlannerPayload() {
  return {
    income: getValue("income"),
    housing: getValue("housing"),
    essentials: getValue("essentials"),
    creditCard: getValue("creditCard"),
    otherDebt: getValue("otherDebt"),
    carPayment: getValue("carPayment"),
    carCosts: getValue("carCosts"),
    emergencyFund: getValue("emergencyFund"),
    creditCardBalance: getValue("creditCardBalance"),
    homeValue: getValue("homeValue"),
    mortgageBalance: getValue("mortgageBalance"),
    carValue: getValue("carValue"),
    carLoanBalance: getValue("carLoanBalance"),
    cashAssets: getValue("cashAssets"),
    otherAssets: getValue("otherAssets"),
    otherLiabilities: getValue("otherLiabilities"),
    age: getValue("age"),
    k401Balance: getValue("k401Balance"),
    k401Contribution: getValue("k401Contribution"),
    rothBalance: getValue("rothBalance"),
    rothContribution: getValue("rothContribution"),
    traditionalIraBalance: getValue("traditionalIraBalance"),
    traditionalIraContribution: getValue("traditionalIraContribution"),
    hsaBalance: getValue("hsaBalance"),
    hsaContribution: getValue("hsaContribution"),
    college529Balance: getValue("college529Balance"),
    college529Contribution: getValue("college529Contribution"),
    brokerageBalance: getValue("brokerageBalance"),
    brokerageContribution: getValue("brokerageContribution"),
    forecastYears: getValue("forecastYears"),
  };
}

function applyPlannerPayload(payload) {
  if (!payload) {
    return;
  }

  Object.entries(payload).forEach(([key, value]) => setValue(key, value));
  updateDashboard();
}

function applyFeatureGate() {
  const locked = !hasInvestmentAccess();
  document.querySelectorAll(".gated-feature").forEach((element) => {
    element.classList.toggle("is-locked", locked);
  });

  const upgradeBanner = document.getElementById("upgrade-banner");
  if (locked && state.user) {
    upgradeBanner.classList.remove("hidden");
  } else {
    upgradeBanner.classList.add("hidden");
  }
}

function renderAccountState() {
  const authForms = document.getElementById("auth-forms");
  const summary = document.getElementById("account-summary");
  const accountActions = document.getElementById("account-actions");
  const logoutButton = document.getElementById("logout-button");
  const manageBillingButton = document.getElementById("manage-billing-button");
  const saveButton = document.getElementById("save-plan");

  if (!state.user) {
    authForms.classList.remove("hidden");
    summary.classList.add("hidden");
    accountActions.classList.add("hidden");
    logoutButton.classList.add("hidden");
    manageBillingButton.classList.add("hidden");
    saveButton.disabled = true;
    setPlannerStatus("Planner changes save after you sign in.");
    setTransactionStatus("Sign in to save and load transactions.");
    populateAccountForm();
    applyFeatureGate();
    renderHeroState();
    return;
  }

  authForms.classList.add("hidden");
  logoutButton.classList.remove("hidden");
  accountActions.classList.remove("hidden");
  manageBillingButton.classList.toggle("hidden", !state.config?.stripeApiConfigured);
  saveButton.disabled = false;
  summary.classList.remove("hidden");
  summary.innerHTML = `
    <div class="account-summary-top">
      <h3>Welcome back, ${state.user.fullName.split(" ")[0]}</h3>
      <span class="trial-pill">${formatTrialMessage()}</span>
    </div>
    <p>You are signed in on the ${
      state.user.plan === "bundle" ? "Budget + Investing" : "Budget Core"
    } plan.</p>
    <p>${
      state.user.trialActive
        ? `Free trial ends ${new Date(state.user.trialEndsAt).toLocaleDateString()}.`
        : state.user.subscriptionActive === false
          ? "Billing is pending."
          : "Billing is active."
    }</p>
  `;
  setPlannerStatus("Signed in. Your planner can be saved to this account.");
  populateAccountForm();
  applyFeatureGate();
  renderHeroState();
}

function setPlaidMessage(text) {
  const message = document.getElementById("plaid-message");
  message.classList.remove("hidden");
  message.textContent = text;
}

function renderList(containerId, rows, emptyText) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `<div class="linked-item"><p>${emptyText}</p></div>`;
    return;
  }

  container.innerHTML = rows.join("");
}

function getCategorySpendMap() {
  return state.transactions.reduce((accumulator, transaction) => {
    accumulator[transaction.category] = (accumulator[transaction.category] || 0) + Number(transaction.amount || 0);
    return accumulator;
  }, {});
}

function renderCategoryProgress() {
  const container = document.getElementById("category-progress");
  const spendMap = getCategorySpendMap();
  container.innerHTML = categoryTargets
    .map((category) => {
      const spent = spendMap[category.key] || 0;
      const ratio = category.target ? Math.min((spent / category.target) * 100, 100) : 0;
      return `
        <article class="category-card">
          <div class="category-top">
            <h3>${category.label}</h3>
            <strong>${currency.format(spent)} / ${currency.format(category.target)}</strong>
          </div>
          <p class="category-meta">${spent > category.target ? "Over target" : "Within target"} this month</p>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.max(ratio, spent ? 6 : 0)}%;background:${category.color}"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTransactions() {
  const container = document.getElementById("transaction-list");
  const filteredTransactions = state.transactions.filter((transaction) => {
    const matchesCategory =
      state.transactionFilters.category === "all" ||
      transaction.category === state.transactionFilters.category;
    const sourceLabel = transaction.source || "manual";
    const matchesSource =
      state.transactionFilters.source === "all" ||
      sourceLabel === state.transactionFilters.source;
    const search = state.transactionFilters.search.trim().toLowerCase();
    const matchesSearch =
      !search || (transaction.merchant || "").toLowerCase().includes(search);

    return matchesCategory && matchesSource && matchesSearch;
  });

  if (!filteredTransactions.length) {
    container.innerHTML = `<div class="transaction-item"><p>No transactions saved yet.</p></div>`;
    updateTransactionSummary(filteredTransactions);
    return;
  }

  container.innerHTML = filteredTransactions
    .map(
      (transaction) => `
        <article class="transaction-item">
          <div class="transaction-top">
            <h3>${transaction.merchant}</h3>
            <strong>${currency.format(transaction.amount)}</strong>
          </div>
          <p>${transaction.category} | ${transaction.source || "manual"} | ${transaction.date}</p>
          <button type="button" class="ghost-btn" data-delete-transaction="${transaction.id}">Delete</button>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-delete-transaction]").forEach((button) => {
    button.addEventListener("click", () => deleteTransaction(button.dataset.deleteTransaction));
  });

  updateTransactionSummary(filteredTransactions);
}

function updateTransactionSummary(transactions) {
  const total = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const byCategory = transactions.reduce((accumulator, transaction) => {
    accumulator[transaction.category] = (accumulator[transaction.category] || 0) + Number(transaction.amount || 0);
    return accumulator;
  }, {});
  const topCategoryEntry = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  document.getElementById("tx-visible-total").textContent = currency.format(total);
  document.getElementById("tx-count").textContent = String(transactions.length);
  document.getElementById("tx-top-category").textContent = topCategoryEntry
    ? `${topCategoryEntry[0]}`
    : "None";
}

function bindTransactionFilters() {
  document.getElementById("transaction-filter-category").addEventListener("change", (event) => {
    state.transactionFilters.category = event.target.value;
    renderTransactions();
  });

  document.getElementById("transaction-filter-source").addEventListener("change", (event) => {
    state.transactionFilters.source = event.target.value;
    renderTransactions();
  });

  document.getElementById("transaction-search").addEventListener("input", (event) => {
    state.transactionFilters.search = event.target.value;
    renderTransactions();
  });
}

function renderLinkedSummary(summary) {
  document.getElementById("live-cash").textContent = currency.format(summary.cashTotal || 0);
  document.getElementById("live-credit-debt").textContent = currency.format(
    summary.creditCardDebt || 0
  );
  document.getElementById("live-loan-debt").textContent = currency.format(summary.loanDebt || 0);
  document.getElementById("live-investments").textContent = currency.format(
    hasInvestmentAccess() ? summary.investmentsTotal || 0 : 0
  );

  renderList(
    "linked-accounts",
    (summary.accounts || []).map(
      (account) => `
        <article class="linked-item">
          <strong>${account.name}</strong>
          <p>${account.typeLabel}</p>
          <p>${currency.format(account.currentBalance || 0)}</p>
        </article>
      `
    ),
    "No linked accounts yet."
  );

  renderList(
    "linked-liabilities",
    (summary.liabilities || []).map(
      (liability) => `
        <article class="linked-item">
          <strong>${liability.name}</strong>
          <p>${liability.kind}</p>
          <p>${currency.format(liability.amount || 0)}</p>
        </article>
      `
    ),
    "No liability data available yet."
  );

  renderList(
    "linked-investments",
    (hasInvestmentAccess() ? summary.investments || [] : []).map(
      (investment) => `
        <article class="linked-item">
          <strong>${investment.accountName}</strong>
          <p>${investment.holdingsCount} holdings</p>
          <p>${currency.format(investment.value || 0)}</p>
        </article>
      `
    ),
    "No investment accounts linked yet."
  );
}

function loadTransactions() {
  if (!state.user) {
    state.transactions = [];
    renderTransactions();
    renderCategoryProgress();
    setTransactionStatus("Sign in to save and load transactions.");
    return Promise.resolve();
  }

  setTransactionStatus("Loading transactions...");
  return fetch("/api/transactions")
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load transactions.");
      }

      state.transactions = payload.transactions || [];
      renderTransactions();
      renderCategoryProgress();
      setTransactionStatus("Transactions loaded.");
    })
    .catch((error) => {
      setTransactionStatus(error.message);
    });
}

function createTransaction(event) {
  event.preventDefault();
  if (!state.user) {
    setTransactionStatus("Sign in before adding transactions.");
    return;
  }

  const payload = {
    merchant: document.getElementById("txMerchant").value.trim(),
    amount: Number(document.getElementById("txAmount").value) || 0,
    category: document.getElementById("txCategory").value,
    date: document.getElementById("txDate").value,
  };

  setTransactionStatus("Saving transaction...");
  fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to save transaction.");
      }

      document.getElementById("transaction-form").reset();
      document.getElementById("txDate").value = new Date().toISOString().slice(0, 10);
      setTransactionStatus("Transaction saved.");
      return loadTransactions();
    })
    .catch((error) => {
      setTransactionStatus(error.message);
    });
}

function deleteTransaction(id) {
  fetch("/api/transactions/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete transaction.");
      }

      setTransactionStatus("Transaction deleted.");
      return loadTransactions();
    })
    .catch((error) => {
      setTransactionStatus(error.message);
    });
}

function getInvestmentInputs() {
  if (!hasInvestmentAccess()) {
    return budgetDefaults;
  }

  return {
    age: getValue("age"),
    k401Balance: getValue("k401Balance"),
    k401Contribution: getValue("k401Contribution"),
    rothBalance: getValue("rothBalance"),
    rothContribution: getValue("rothContribution"),
    traditionalIraBalance: getValue("traditionalIraBalance"),
    traditionalIraContribution: getValue("traditionalIraContribution"),
    hsaBalance: getValue("hsaBalance"),
    hsaContribution: getValue("hsaContribution"),
    college529Balance: getValue("college529Balance"),
    college529Contribution: getValue("college529Contribution"),
    brokerageBalance: getValue("brokerageBalance"),
    brokerageContribution: getValue("brokerageContribution"),
    forecastYears: getValue("forecastYears"),
  };
}

function savePlanner(showMessage = false) {
  if (!state.user) {
    if (showMessage) {
      setPlannerStatus("Sign in to save your planner.");
    }
    return Promise.resolve();
  }

  if (showMessage) {
    setPlannerStatus("Saving plan...");
  }

  return fetch("/api/planner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getPlannerPayload()),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save plan.");
      }

      setPlannerStatus("Plan saved to your account.");
    })
    .catch((error) => {
      setPlannerStatus(error.message);
    });
}

function queuePlannerSave() {
  if (!state.user) {
    return;
  }

  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    savePlanner(false);
  }, 700);
}

function loadPlanner() {
  if (!state.user) {
    return Promise.resolve();
  }

  setPlannerStatus("Loading your saved planner...");
  return fetch("/api/planner")
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load planner.");
      }

      if (payload.planner) {
        applyPlannerPayload(payload.planner);
        setPlannerStatus("Saved planner loaded.");
      } else {
        setPlannerStatus("No saved planner yet for this account.");
      }
    })
    .catch((error) => {
      setPlannerStatus(error.message);
    });
}

function renderCharts(data) {
  const cashflowChart = document.getElementById("cashflow-chart");
  const expenseLegend = document.getElementById("expense-legend");
  const investmentBars = document.getElementById("investment-bars");
  const cashflowPercent = document.getElementById("cashflow-percent");
  const expenseTotal = document.getElementById("expense-total");
  const investGrowthLabel = document.getElementById("invest-growth-label");
  const cashflowNote = document.getElementById("cashflow-note");
  const expenseNote = document.getElementById("expense-note");
  const investNote = document.getElementById("invest-note");

  const incomeBase = Math.max(data.income, 1);
  const cashSegments = [
    { key: "housing", label: "Housing", amount: data.housing },
    { key: "essentials", label: "Essentials", amount: data.essentials },
    { key: "debt", label: "Debt", amount: data.creditCardPayment + data.otherDebt },
    { key: "car", label: "Car", amount: data.carPayment + data.carCosts },
    { key: "leftover", label: "Leftover", amount: Math.max(data.leftover, 0) },
  ];

  cashflowChart.innerHTML = cashSegments
    .map((segment) => {
      const height = Math.max((segment.amount / incomeBase) * 180, 14);
      const share = percent.format(segment.amount / incomeBase);
      return `
        <div class="stack-column">
          <div class="stack-segment" style="height:${height}px;background:${chartPalette[segment.key]}">
            <strong>${share}</strong>
          </div>
          <span class="stack-label">${segment.label}</span>
        </div>
      `;
    })
    .join("");

  expenseLegend.innerHTML = cashSegments
    .filter((segment) => segment.key !== "leftover")
    .map(
      (segment) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${chartPalette[segment.key]}"></span>
          <p>${segment.label}</p>
          <strong>${currency.format(segment.amount)}</strong>
        </div>
      `
    )
    .join("");

  const investMax = Math.max(
    data.k401Future,
    data.rothFuture,
    data.traditionalIraFuture,
    data.hsaFuture,
    data.college529Future,
    data.brokerageFuture,
    1
  );
  const investmentRows = [
    { key: "k401", label: "401(k)", amount: data.k401Future },
    { key: "roth", label: "Roth IRA", amount: data.rothFuture },
    { key: "traditionalIra", label: "Traditional IRA", amount: data.traditionalIraFuture },
    { key: "hsa", label: "HSA", amount: data.hsaFuture },
    { key: "college529", label: "529", amount: data.college529Future },
    { key: "brokerage", label: "Brokerage", amount: data.brokerageFuture },
  ];

  investmentBars.innerHTML = hasInvestmentAccess()
    ? investmentRows
    .map((row) => {
      const width = Math.max((row.amount / investMax) * 100, 4);
      return `
        <div class="bar-item">
          <p>${row.label}</p>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%;background:${chartPalette[row.key]}"></div>
          </div>
          <strong>${currency.format(row.amount)}</strong>
        </div>
      `;
    })
    .join("")
    : `<div class="linked-item"><p>Upgrade to Bundle to unlock investment forecasting visuals.</p></div>`;

  cashflowPercent.textContent = percent.format(Math.max(data.leftover, 0) / incomeBase);
  expenseTotal.textContent = currency.format(data.totalExpenses);
  investGrowthLabel.textContent = hasInvestmentAccess() ? currency.format(data.totalFuture) : "Locked";
  cashflowNote.textContent =
    data.leftover >= 0
      ? `${currency.format(data.leftover)} is left after core monthly spending.`
      : `${currency.format(Math.abs(data.leftover))} short each month before extra spending.`;
  const largestExpense = cashSegments
    .filter((segment) => segment.key !== "leftover")
    .sort((first, second) => second.amount - first.amount)[0];
  expenseNote.textContent = `${largestExpense.label} is currently the largest monthly pressure point.`;
  investNote.textContent = hasInvestmentAccess()
    ? `Projected total after ${data.years} years: ${currency.format(data.totalFuture)}.`
    : "Investment forecasting is available on the Bundle plan.";
}

function renderHealth(snapshot) {
  const debtPenalty = Math.min(snapshot.debtRatio * 120, 38);
  const carPenalty = Math.min(snapshot.carRatio * 100, 22);
  const emergencyBoost = Math.min(snapshot.emergencyMonths * 8, 24);
  const leftoverBoost = snapshot.leftover > 0 ? Math.min((snapshot.leftover / snapshot.income) * 120, 22) : -18;
  const score = Math.max(8, Math.min(100, Math.round(54 - debtPenalty - carPenalty + emergencyBoost + leftoverBoost)));

  const orb = document.getElementById("score-orb");
  const healthScore = document.getElementById("health-score");
  const healthLabel = document.getElementById("health-label");
  const healthSummary = document.getElementById("health-summary");
  const signalSavings = document.getElementById("signal-savings");
  const signalDebt = document.getElementById("signal-debt");
  const signalInvesting = document.getElementById("signal-investing");

  healthScore.textContent = String(score);
  orb.style.background = `radial-gradient(circle at center, #ffffff 0 52%, transparent 53%), conic-gradient(${score >= 75 ? "#00b894" : score >= 50 ? "#ffd33d" : "#ff5a36"} ${score * 3.6}deg, #eaeef4 0deg)`;

  if (score >= 75) {
    healthLabel.textContent = "Strong footing";
    healthSummary.textContent = "Your current setup looks reasonably stable. Focus on consistency, growing savings, and gradually raising investing.";
  } else if (score >= 50) {
    healthLabel.textContent = "Recoverable";
    healthSummary.textContent = "You have a workable base, but one or two categories are stealing flexibility. Tightening those will improve the whole plan.";
  } else {
    healthLabel.textContent = "High pressure";
    healthSummary.textContent = "Cash flow or debt load is putting the plan under stress. Stabilizing spending and reducing expensive debt should come first.";
  }

  signalSavings.textContent =
    snapshot.emergencyMonths >= 3 ? "Strong" : snapshot.emergencyMonths >= 1 ? "Building" : "Needs work";
  signalDebt.textContent =
    snapshot.debtRatio > 0.35 ? "High" : snapshot.debtRatio > 0.2 ? "Moderate" : "Balanced";
  signalInvesting.textContent =
    snapshot.leftover > 500 && snapshot.creditCardBalance === 0 ? "Room to grow" : "Cautious";
}

function updateDashboard() {
  const income = getValue("income");
  const housing = getValue("housing");
  const essentials = getValue("essentials");
  const creditCardPayment = getValue("creditCard");
  const otherDebt = getValue("otherDebt");
  const carPayment = getValue("carPayment");
  const carCosts = getValue("carCosts");
  const emergencyFund = getValue("emergencyFund");
  const creditCardBalance = getValue("creditCardBalance");
  const homeValue = getValue("homeValue");
  const mortgageBalance = getValue("mortgageBalance");
  const carValue = getValue("carValue");
  const carLoanBalance = getValue("carLoanBalance");
  const cashAssets = getValue("cashAssets");
  const otherAssets = getValue("otherAssets");
  const otherLiabilities = getValue("otherLiabilities");
  const investmentInputs = getInvestmentInputs();
  const years = investmentInputs.forecastYears;

  const totalExpenses =
    housing + essentials + creditCardPayment + otherDebt + carPayment + carCosts;
  const leftover = income - totalExpenses;
  const debtRatio = income ? (creditCardPayment + otherDebt + carPayment) / income : 0;
  const carRatio = income ? (carPayment + carCosts) / income : 0;
  const essentialsBase = housing + essentials;
  const emergencyMonths = essentialsBase ? emergencyFund / essentialsBase : 0;

  const k401Future = futureValue(
    investmentInputs.k401Balance,
    investmentInputs.k401Contribution,
    returns.k401,
    years
  );
  const rothFuture = futureValue(
    investmentInputs.rothBalance,
    investmentInputs.rothContribution,
    returns.roth,
    years
  );
  const traditionalIraFuture = futureValue(
    investmentInputs.traditionalIraBalance,
    investmentInputs.traditionalIraContribution,
    returns.traditionalIra,
    years
  );
  const hsaFuture = futureValue(
    investmentInputs.hsaBalance,
    investmentInputs.hsaContribution,
    returns.hsa,
    years
  );
  const college529Future = futureValue(
    investmentInputs.college529Balance,
    investmentInputs.college529Contribution,
    returns.college529,
    years
  );
  const brokerageFuture = futureValue(
    investmentInputs.brokerageBalance,
    investmentInputs.brokerageContribution,
    returns.brokerage,
    years
  );
  const totalFuture = hasInvestmentAccess()
    ? k401Future + rothFuture + traditionalIraFuture + hsaFuture + college529Future + brokerageFuture
    : 0;
  const currentInvestmentAssets = hasInvestmentAccess()
    ? investmentInputs.k401Balance +
      investmentInputs.rothBalance +
      investmentInputs.traditionalIraBalance +
      investmentInputs.hsaBalance +
      investmentInputs.college529Balance +
      investmentInputs.brokerageBalance
    : 0;
  const homeEquity = homeValue - mortgageBalance;
  const carEquity = carValue - carLoanBalance;
  const totalAssets = homeValue + carValue + cashAssets + currentInvestmentAssets + otherAssets;
  const totalLiabilities =
    mortgageBalance + carLoanBalance + creditCardBalance + otherDebt + otherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  document.getElementById("leftover").textContent = currency.format(leftover);
  document.getElementById("debtRatio").textContent = percent.format(debtRatio);
  document.getElementById("carRatio").textContent = percent.format(carRatio);
  document.getElementById("emergencyMonths").textContent = emergencyMonths.toFixed(1);

  document.getElementById("k401Future").textContent = hasInvestmentAccess() ? currency.format(k401Future) : "Locked";
  document.getElementById("rothFuture").textContent = hasInvestmentAccess() ? currency.format(rothFuture) : "Locked";
  document.getElementById("traditionalIraFuture").textContent = hasInvestmentAccess()
    ? currency.format(traditionalIraFuture)
    : "Locked";
  document.getElementById("hsaFuture").textContent = hasInvestmentAccess() ? currency.format(hsaFuture) : "Locked";
  document.getElementById("college529Future").textContent = hasInvestmentAccess()
    ? currency.format(college529Future)
    : "Locked";
  document.getElementById("brokerageFuture").textContent = hasInvestmentAccess() ? currency.format(brokerageFuture) : "Locked";
  document.getElementById("totalFuture").textContent = hasInvestmentAccess() ? currency.format(totalFuture) : "Locked";

  document.getElementById("hero-leftover").textContent = currency.format(leftover);
  document.getElementById("hero-growth").textContent = hasInvestmentAccess() ? currency.format(totalFuture) : "Upgrade";
  document.getElementById("hero-debt-pressure").textContent =
    debtRatio > 0.35 ? "High" : debtRatio > 0.2 ? "Moderate" : "Balanced";
  document.getElementById("homeEquity").textContent = currency.format(homeEquity);
  document.getElementById("carEquity").textContent = currency.format(carEquity);
  document.getElementById("totalAssets").textContent = currency.format(totalAssets);
  document.getElementById("totalLiabilities").textContent = currency.format(totalLiabilities);
  document.getElementById("netWorth").textContent = currency.format(netWorth);
  document.getElementById("homeNetLabel").textContent = currency.format(homeEquity);
  document.getElementById("carNetLabel").textContent = currency.format(carEquity);
  document.getElementById("liquidNetLabel").textContent = currency.format(
    cashAssets + currentInvestmentAssets + otherAssets - otherLiabilities
  );

  const allocation = getAllocation(investmentInputs.age);
  document.getElementById("allocation").innerHTML = hasInvestmentAccess()
    ? `
      <h3>${allocation.title}</h3>
      <p>${allocation.stocks}% stocks / ${allocation.bonds}% bonds</p>
      <p>${allocation.note}</p>
      <ul>${allocation.funds.map((fund) => `<li>${fund}</li>`).join("")}</ul>
    `
    : `
      <h3>Bundle required</h3>
      <p>Upgrade to unlock age-based allocation guidance for retirement investing.</p>
    `;

  renderRecommendations(
    buildRecommendations({
      leftover,
      debtRatio,
      carRatio,
      emergencyMonths,
      creditCardBalance,
      creditCardPayment,
    })
  );
  renderHealth({
    income,
    leftover,
    debtRatio,
    carRatio,
    emergencyMonths,
    creditCardBalance,
  });

  renderCharts({
    income,
    housing,
    essentials,
    creditCardPayment,
    otherDebt,
    carPayment,
    carCosts,
    leftover,
    totalExpenses,
    k401Future,
    rothFuture,
    traditionalIraFuture,
    hsaFuture,
    college529Future,
    brokerageFuture,
    totalFuture,
    years,
  });
}

function handleSignup(event) {
  event.preventDefault();
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const plan = document.getElementById("plan").value;
  const button = document.getElementById("signup-button");

  button.disabled = true;
  setAuthMessage("Starting your free trial...");

  fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, email, password, plan }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to create account.");
      }

      state.user = payload.account;
      renderAccountState();
      setAuthMessage(payload.checkoutUrl
        ? "Free trial started. Opening checkout to secure billing after the trial..."
        : payload.message);
      setActivePage("snapshot");

      if (payload.checkoutUrl) {
        window.open(payload.checkoutUrl, "_blank", "noopener");
      }
    })
    .catch((error) => {
      setAuthMessage(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const button = document.getElementById("login-button");

  button.disabled = true;
  setAuthMessage("Logging in...");

  fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to log in.");
      }

      state.user = payload.account;
      renderAccountState();
      setAuthMessage(payload.message);
      setActivePage("snapshot");
      return Promise.all([loadPlanner(), loadLinkedSummary(), loadTransactions()]);
    })
    .catch((error) => {
      setAuthMessage(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function handleLogout() {
  fetch("/api/logout", { method: "POST" })
    .then(() => {
      state.user = null;
      state.transactions = [];
      renderAccountState();
      renderTransactions();
      renderCategoryProgress();
      renderLinkedSummary({
        cashTotal: 0,
        creditCardDebt: 0,
        loanDebt: 0,
        investmentsTotal: 0,
        accounts: [],
        liabilities: [],
        investments: [],
      });
      setAuthMessage("Logged out.");
      setPlaidMessage("Sign in before linking or loading account data.");
      applyFeatureGate();
      setActivePage("snapshot");
    });
}

function handleUpgrade() {
  if (!state.user) {
    setAuthMessage("Create an account or log in before upgrading.");
    return;
  }

  setAuthMessage("Upgrading account...");
  fetch("/api/account/upgrade", { method: "POST" })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to upgrade account.");
      }

      state.user = payload.account;
      renderAccountState();
      updateDashboard();
      setAuthMessage(payload.message);
      if (payload.checkoutUrl) {
        window.open(payload.checkoutUrl, "_blank", "noopener");
      }
    })
    .catch((error) => {
      setAuthMessage(error.message);
    });
}

function handleManageBilling() {
  if (!state.user) {
    setAuthMessage("Log in before managing billing.");
    return;
  }

  fetch("/api/billing/portal", { method: "POST" })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to open billing portal.");
      }

      window.open(payload.url, "_blank", "noopener");
    })
    .catch((error) => {
      setAuthMessage(error.message);
    });
}

function handleAccountSave() {
  if (!state.user) {
    setAccountStatus("Sign in before updating your account.");
    return;
  }

  const fullName = document.getElementById("accountFullName").value.trim();
  const email = document.getElementById("accountEmail").value.trim();
  const button = document.getElementById("account-save-button");

  button.disabled = true;
  setAccountStatus("Saving account details...");

  fetch("/api/account/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, email }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update account.");
      }

      state.user = payload.account;
      renderAccountState();
      setAuthMessage(payload.message);
      setAccountStatus(payload.message);
    })
    .catch((error) => {
      setAccountStatus(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function loadLinkedSummary() {
  return fetch("/api/plaid/summary")
    .then(async (response) => {
      if (response.status === 404) {
        return null;
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load linked account data.");
      }

      return payload;
    })
    .then((payload) => {
      if (!payload) {
        renderLinkedSummary({
          cashTotal: 0,
          creditCardDebt: 0,
          loanDebt: 0,
          investmentsTotal: 0,
          accounts: [],
          liabilities: [],
          investments: [],
        });
        return;
      }

      renderLinkedSummary(payload);
      setPlaidMessage(
        payload.connected
          ? `Loaded ${payload.accounts.length} linked accounts from Plaid.`
          : "Plaid is configured, but no accounts are linked yet."
      );
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function exchangePublicToken(publicToken, metadata) {
  setPlaidMessage("Link succeeded. Exchanging token and pulling balances...");

  return fetch("/api/plaid/exchange-public-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_token: publicToken, metadata }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to exchange public token.");
      }

      return payload;
    })
    .then((payload) => {
      setPlaidMessage(payload.message);
      return loadLinkedSummary();
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function initializePlaidLink(token) {
  if (!window.Plaid) {
    setPlaidMessage("Plaid Link script did not load. Check your network or content security policy.");
    return;
  }

  state.plaidHandler = window.Plaid.create({
    token,
    onSuccess: (publicToken, metadata) => {
      exchangePublicToken(publicToken, metadata);
    },
    onExit: (error) => {
      if (error) {
        setPlaidMessage(
          error.display_message || error.error_message || "Plaid Link exited with an error."
        );
      }
    },
  });

  state.plaidHandler.open();
}

function connectPlaidAccounts() {
  setPlaidMessage("Creating a Plaid Link session...");

  fetch("/api/plaid/create-link-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to create a Plaid link token.");
      }

      initializePlaidLink(payload.link_token);
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function importPlaidTransactions() {
  if (!state.user) {
    setPlaidMessage("Sign in before importing transactions.");
    return;
  }

  setPlaidMessage("Importing Plaid transactions...");
  fetch("/api/plaid/import-transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to import Plaid transactions.");
      }

      setPlaidMessage(payload.message);
      return loadTransactions();
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function loadConfig() {
  return fetch("/api/config")
    .then((response) => response.json())
    .then((config) => {
      state.config = config;
      updateIntegrationStatus(config);
      renderAccountState();
      return fetch("/api/session");
    })
    .then((response) => response && response.json ? response.json() : response)
    .then((session) => {
      if (!session) {
        return;
      }

      state.user = session.authenticated ? session.account : null;
      renderAccountState();
      if (state.user) {
        return loadPlanner().then(() => {
          if (state.config.plaidConfigured) {
            return Promise.all([loadLinkedSummary(), loadTransactions()]);
          }
          setPlaidMessage("Add Plaid credentials in .env to enable live account linking.");
          return loadTransactions();
        });
      }

      state.transactions = [];
      renderTransactions();
      renderCategoryProgress();
      renderLinkedSummary({
        cashTotal: 0,
        creditCardDebt: 0,
        loanDebt: 0,
        investmentsTotal: 0,
        accounts: [],
        liabilities: [],
        investments: [],
      });
      setPlaidMessage(
        state.config.plaidConfigured
          ? "Sign in before linking or loading account data."
          : "Add Plaid credentials in .env to enable live account linking."
      );
    })
    .catch(() => {
      document.getElementById("auth-status").textContent = "Unavailable";
      document.getElementById("billing-status").textContent = "Unavailable";
    });
}

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scroll);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

document.querySelectorAll("[data-page-target]").forEach((button) => {
  button.addEventListener("click", () => {
    setActivePage(button.dataset.pageTarget);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.getElementById("signup-form").addEventListener("submit", handleSignup);
document.getElementById("login-form").addEventListener("submit", handleLogin);
document.getElementById("logout-button").addEventListener("click", handleLogout);
document.getElementById("manage-billing-button").addEventListener("click", handleManageBilling);
document.getElementById("account-save-button").addEventListener("click", handleAccountSave);
document.getElementById("account-billing-button").addEventListener("click", handleManageBilling);
document.getElementById("account-logout-button").addEventListener("click", handleLogout);
document.getElementById("connect-accounts").addEventListener("click", connectPlaidAccounts);
document.getElementById("import-transactions").addEventListener("click", importPlaidTransactions);
document.getElementById("save-plan").addEventListener("click", () => savePlanner(true));
document.getElementById("upgrade-button").addEventListener("click", handleUpgrade);
document.getElementById("transaction-form").addEventListener("submit", createTransaction);
bindTransactionFilters();

document
  .querySelectorAll("#budget-form input, #investment-form input, #networth-form input")
  .forEach((input) =>
    input.addEventListener("input", () => {
      updateDashboard();
      queuePlannerSave();
    })
  );

updateDashboard();
renderTransactions();
renderCategoryProgress();
applyFeatureGate();
setActivePage(window.location.hash.replace("#", "") || "snapshot");
loadConfig();
handleCheckoutReturn();
document.getElementById("txDate").value = new Date().toISOString().slice(0, 10);
