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
  currentPage: "home",
  authMode: "signup",
  plaidHandler: null,
  user: null,
  linkedSummary: {
    cashTotal: 0,
    creditCardDebt: 0,
    loanDebt: 0,
    investmentsTotal: 0,
    accounts: [],
    liabilities: [],
    investments: [],
  },
  saveTimer: null,
  ai: {
    previousResponseId: null,
    messages: [],
    isLoading: false,
  },
  transactions: [],
  subscriptions: [],
  recurringBills: [],
  recurringIncome: [],
  spendingPeriod: "month",
  spendingOffset: 0,
  transactionFilters: {
    category: "all",
    source: "all",
    search: "",
  },
};

const budgetDefaults = {
  age: 32,
  retirementAge: 67,
  retirementMonthlyGoal: 6500,
  retirementIncomeOther: 2200,
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

const chartSolidPalette = {
  housing: "#3867ff",
  essentials: "#00b894",
  debt: "#ff5a36",
  car: "#ff4fa1",
  leftover: "#ffd33d",
  k401: "#3867ff",
  roth: "#00b894",
  traditionalIra: "#14b8ff",
  hsa: "#7c4dff",
  college529: "#ff9f1c",
  brokerage: "#ff4fa1",
  fun: "#7c4dff",
  other: "#64748b",
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
      note: "Having more cash set aside usually means you can handle more stock exposure, especially in broad index funds.",
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
    body: "If you still have money left each month and no credit card balance, consider increasing retirement contributions toward 15% of income.",
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMerchantName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Unknown merchant";
  }

  const cleaned = raw
    .replace(/\b(POS|DEBIT|DBT|PURCHASE|CARD|ACH|CHECKCARD|CHECK CARD|PAYMENT TO|SQ\s*\*)\b/gi, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[#*]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const words = (cleaned || raw)
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  return words.join(" ");
}

function formatCategoryLabel(value) {
  const labels = {
    housing: "Housing",
    essentials: "Essentials",
    debt: "Debt",
    car: "Car",
    fun: "Fun",
    other: "Other",
  };

  return labels[value] || "Other";
}

function getMerchantBadge(value) {
  const words = formatMerchantName(value).split(" ").filter(Boolean);
  if (!words.length) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const identityProfiles = [
  { match: /chase/i, label: "C", bg: "#ffffff", color: "#1d4ed8", logo: "https://logo.clearbit.com/chase.com" },
  { match: /bank of america|bofa/i, label: "BofA", bg: "#ffffff", color: "#c81e1e", logo: "https://logo.clearbit.com/bankofamerica.com" },
  { match: /american express|amex/i, label: "Amex", bg: "#ffffff", color: "#0f5db8", logo: "https://logo.clearbit.com/americanexpress.com" },
  { match: /capital one/i, label: "CO", bg: "#ffffff", color: "#1d4ed8", logo: "https://logo.clearbit.com/capitalone.com" },
  { match: /citi|citibank/i, label: "Citi", bg: "#ffffff", color: "#2563eb", logo: "https://logo.clearbit.com/citi.com" },
  { match: /wells fargo/i, label: "WF", bg: "#ffffff", color: "#b91c1c", logo: "https://logo.clearbit.com/wellsfargo.com" },
  { match: /discover/i, label: "Disc", bg: "#ffffff", color: "#f97316", logo: "https://logo.clearbit.com/discover.com" },
  { match: /us bank|u\.s\. bank/i, label: "US", bg: "#ffffff", color: "#ef4444", logo: "https://logo.clearbit.com/usbank.com" },
  { match: /td bank|toronto dominion|\btd\b/i, label: "TD", bg: "#ffffff", color: "#16a34a", logo: "https://logo.clearbit.com/td.com" },
  { match: /pnc/i, label: "PNC", bg: "#ffffff", color: "#f97316", logo: "https://logo.clearbit.com/pnc.com" },
  { match: /ally/i, label: "ally", bg: "#ffffff", color: "#5b21b6", logo: "https://logo.clearbit.com/ally.com" },
  { match: /sofi/i, label: "SoFi", bg: "#ffffff", color: "#0ea5e9", logo: "https://logo.clearbit.com/sofi.com" },
  { match: /fidelity/i, label: "F", bg: "#ffffff", color: "#15803d", logo: "https://logo.clearbit.com/fidelity.com" },
  { match: /vanguard/i, label: "V", bg: "#ffffff", color: "#b91c1c", logo: "https://logo.clearbit.com/vanguard.com" },
  { match: /schwab/i, label: "CS", bg: "#ffffff", color: "#0284c7", logo: "https://logo.clearbit.com/schwab.com" },
  { match: /robinhood/i, label: "RH", bg: "#ffffff", color: "#14532d", logo: "https://logo.clearbit.com/robinhood.com" },
  { match: /paypal/i, label: "PP", bg: "#ffffff", color: "#1d4ed8", logo: "https://logo.clearbit.com/paypal.com" },
  { match: /apple/i, label: "Apple", bg: "#ffffff", color: "#111827", logo: "https://logo.clearbit.com/apple.com" },
  { match: /starbucks/i, label: "Sb", bg: "#ffffff", color: "#047857", logo: "https://logo.clearbit.com/starbucks.com" },
  { match: /amazon/i, label: "az", bg: "#ffffff", color: "#111827", logo: "https://logo.clearbit.com/amazon.com" },
  { match: /whole foods/i, label: "WF", bg: "#ffffff", color: "#15803d", logo: "https://logo.clearbit.com/wholefoodsmarket.com" },
  { match: /netflix/i, label: "N", bg: "#ffffff", color: "#dc2626", logo: "https://logo.clearbit.com/netflix.com" },
  { match: /spotify/i, label: "S", bg: "#ffffff", color: "#166534", logo: "https://logo.clearbit.com/spotify.com" },
  { match: /uber/i, label: "U", bg: "#ffffff", color: "#111827", logo: "https://logo.clearbit.com/uber.com" },
  { match: /lyft/i, label: "Ly", bg: "#ffffff", color: "#be185d", logo: "https://logo.clearbit.com/lyft.com" },
  { match: /adobe/i, label: "Ae", bg: "#ffffff", color: "#b91c1c", logo: "https://logo.clearbit.com/adobe.com" },
  { match: /doordash/i, label: "D", bg: "#ffffff", color: "#ea580c", logo: "https://logo.clearbit.com/doordash.com" },
  { match: /notion/i, label: "N", bg: "#ffffff", color: "#111827", logo: "https://logo.clearbit.com/notion.so" },
];

function getIdentityProfile(value) {
  const raw = String(value || "").trim();
  const formatted = formatMerchantName(raw);
  const match = identityProfiles.find((profile) => profile.match.test(raw) || profile.match.test(formatted));
  if (match) {
    return match;
  }

  return {
    label: getMerchantBadge(formatted),
    bg: "linear-gradient(135deg, rgba(56, 103, 255, 0.16), rgba(20, 184, 255, 0.22))",
    color: "#1e3a8a",
  };
}

function renderIdentityBadge(value, className = "transaction-avatar", overrideProfile = null) {
  const profile = overrideProfile || getIdentityProfile(value);
  const logoMarkup = profile.logo
    ? `<img class="identity-logo" src="${escapeHtml(profile.logo)}" alt="${escapeHtml(formatMerchantName(value || profile.label))} logo" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" /><span class="identity-fallback" style="display:none;">${escapeHtml(profile.label)}</span>`
    : `<span class="identity-fallback">${escapeHtml(profile.label)}</span>`;
  return `<div class="${className}" style="--identity-bg:${profile.bg}; --identity-color:${profile.color};">${logoMarkup}</div>`;
}

function getInstitutionProfile(institution, fallbackValue = "") {
  if (!institution) {
    return getIdentityProfile(fallbackValue);
  }

  if (institution.logo) {
    return {
      label: getMerchantBadge(institution.name || fallbackValue),
      bg: "#ffffff",
      color: institution.primaryColor || "#1e3a8a",
      logo: institution.logo,
    };
  }

  return getIdentityProfile(institution.name || fallbackValue);
}

function formatTransactionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function updateIntegrationStatus(config) {
  document.getElementById("auth-status").textContent = config.supabaseConfigured
    ? "Connected"
    : "Demo mode";
  document.getElementById("billing-status").textContent =
    config.stripeApiConfigured || (config.stripeBudgetConfigured && config.stripeBundleConfigured)
      ? "Connected"
      : "Demo mode";
  const signupNote = document.getElementById("signup-note");
  const accountsNote = document.getElementById("accounts-note");
  const billingNote = document.getElementById("billing-note");
  signupNote.classList.remove("hidden");
  accountsNote.classList.remove("hidden");
  billingNote.classList.remove("hidden");

  signupNote.textContent =
    config.stripeApiConfigured || (config.stripeBudgetConfigured && config.stripeBundleConfigured)
      ? config.emailConfigured
        ? "Billing is connected. New members can start a free trial, move into checkout, and receive verification emails."
        : "Billing is connected. New members can start a free trial and move into checkout, but account emails are not on yet."
      : "Billing is still in demo mode. Accounts can be created, but live subscription charging is not on yet.";

  accountsNote.textContent = config.plaidConfigured
    ? "Plaid is connected in sandbox mode right now, so account linking is ready for testing after email verification."
    : "Account linking will come to life here once Plaid is fully connected.";

  billingNote.textContent = config.stripeApiConfigured
    ? "Billing portal is ready. Payment method updates and cancellation should happen there."
    : "Billing portal is not live yet, so payment-method changes and cancellation are still placeholder flows.";

  syncAiAvailability();
}

function setAuthMessage(text) {
  const message = document.getElementById("auth-message");
  if (!text) {
    message.textContent = "";
    message.classList.add("hidden");
    return;
  }

  message.classList.remove("hidden");
  message.textContent = text;
}

function renderHeroState() {
  const hero = document.querySelector(".hero");
  if (!hero) {
    return;
  }

  const shouldCompact = state.currentPage !== "home" || Boolean(state.user);
  hero.classList.toggle("hero-compact", shouldCompact);
}

function getMobilePageMeta(page) {
  const meta = {
    home: { title: "Growr", kicker: "Home" },
    snapshot: { title: "Dashboard", kicker: "Snapshot" },
    recurring: { title: "Recurring", kicker: "Subscriptions + bills" },
    spending: { title: "Spending", kicker: "Income and categories" },
    transactions: { title: "Transactions", kicker: "All activity" },
    couples: { title: "Couples", kicker: "Household view" },
    investing: { title: "Investing", kicker: "Future planning" },
    networth: { title: "Net worth", kicker: "Your full picture" },
    accounts: { title: "Accounts", kicker: "Connected money" },
    account: { title: "More", kicker: "Profile and billing" },
    auth: { title: "Growr", kicker: "Welcome" },
    privacy: { title: "Privacy", kicker: "Legal" },
    terms: { title: "Terms", kicker: "Legal" },
  };

  return meta[page] || { title: "Growr", kicker: "Money app" };
}

function updateMobileAppChrome() {
  document.body.dataset.page = state.currentPage;
  document.body.classList.toggle("mobile-app-shell", state.currentPage !== "home");

  const header = document.getElementById("mobile-app-header");
  const title = document.getElementById("mobile-app-header-title");
  const kicker = document.getElementById("mobile-app-header-kicker");
  const badge = document.getElementById("mobile-app-header-badge");
  const meta = getMobilePageMeta(state.currentPage);

  if (header && title && kicker) {
    const showHeader = state.currentPage !== "home";
    header.classList.toggle("hidden", !showHeader);
    header.setAttribute("aria-hidden", showHeader ? "false" : "true");
    title.textContent = meta.title;
    kicker.textContent = meta.kicker;
  }

  if (badge) {
    badge.textContent = state.user ? "•" : "○";
  }

  document.querySelectorAll(".mobile-nav-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pageTarget === state.currentPage);
  });
}

function setActivePage(page) {
  const requestedPage = page === "accounts" ? "snapshot" : page;
  const nextPage = document.querySelector(`.app-page[data-page="${requestedPage}"]`) ? requestedPage : "snapshot";
  state.currentPage = nextPage;
  document.querySelectorAll(".app-page").forEach((section) => {
    const isSnapshotAccountsCompanion = nextPage === "snapshot" && section.dataset.page === "accounts";
    section.classList.toggle("is-active", section.dataset.page === nextPage || isSnapshotAccountsCompanion);
  });
  document.querySelectorAll(".tab-btn[data-page-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pageTarget === nextPage);
  });
  if (window.location.hash !== `#${nextPage}`) {
    window.history.replaceState({}, "", `#${nextPage}`);
  }
  if (window.matchMedia("(max-width: 960px)").matches) {
    setAiWidgetOpen(false);
  }
  renderHeroState();
}

function setAuthView(mode = "signup") {
  state.authMode = mode === "login" ? "login" : "signup";

  const signupPanel = document.getElementById("signup-panel");
  const loginPanel = document.getElementById("login-panel");
  const kicker = document.getElementById("auth-mode-kicker");
  const title = document.getElementById("auth-mode-title");
  const copy = document.getElementById("auth-mode-copy");
  const visual = document.getElementById("auth-showcase-visual");

  signupPanel.classList.toggle("hidden", state.authMode !== "signup");
  loginPanel.classList.toggle("hidden", state.authMode !== "login");
  toggleResetMode(false);

  if (state.authMode === "login") {
    kicker.textContent = "Welcome back";
    title.textContent = "Log in to Growr";
    copy.textContent = "Pick up your budget, connected accounts, and investing plan right where you left them.";
    visual.classList.add("auth-showcase-login");
    visual.classList.remove("auth-showcase-signup");
    return;
  }

  kicker.textContent = "Growr access";
  title.textContent = "Create your Growr account";
  copy.textContent = "Set up your login, start your free trial, and bring budgeting plus investing into one place.";
  visual.classList.add("auth-showcase-signup");
  visual.classList.remove("auth-showcase-login");
}

function openAuthPanel(mode = "signup") {
  setAuthView(mode);
  setActivePage("auth");
  if (window.matchMedia("(max-width: 960px)").matches) {
    setAiWidgetOpen(false);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (mode === "login") {
    setAuthMessage("Welcome back. Log in to pick up where you left off.");
    document.getElementById("loginEmail").focus();
    return;
  }

  setAuthMessage("Start your free trial to unlock your full Growr dashboard.");
  document.getElementById("fullName").focus();
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

function updatePlannerActionState() {
  const autofillButton = document.getElementById("autofill-plan");
  const saveButton = document.getElementById("save-plan");
  if (!autofillButton || !saveButton) {
    return;
  }

  const hasConnectedSignals =
    Boolean(state.linkedSummary?.accounts?.length) ||
    Boolean(state.transactions.length) ||
    state.linkedSummary.cashTotal > 0 ||
    state.linkedSummary.creditCardDebt > 0 ||
    state.linkedSummary.loanDebt > 0;

  saveButton.disabled = !state.user;
  autofillButton.disabled = !state.user || !hasConnectedSignals;

  if (!state.user) {
    autofillButton.title = "Sign in first";
    saveButton.title = "Sign in first";
    return;
  }

  saveButton.title = "Save this planner to your account";
  autofillButton.title = hasConnectedSignals
    ? "Use connected balances and transactions to draft the planner"
    : "Connect accounts or load transactions first";
}

function setTransactionStatus(text) {
  document.getElementById("transaction-status").textContent = text;
}

function setSubscriptionStatus(text) {
  const element = document.getElementById("subscription-status");
  if (element) {
    element.textContent = text;
  }
}

function setBillStatus(text) {
  const element = document.getElementById("bill-status");
  if (element) {
    element.textContent = text;
  }
}

function setPaycheckStatus(text) {
  const element = document.getElementById("paycheck-status");
  if (element) {
    element.textContent = text;
  }
}

function setAccountStatus(text) {
  document.getElementById("account-status").textContent = text;
}

function setAiStatus(text) {
  document.getElementById("ai-status").textContent = text;
}

function setAiWidgetOpen(open) {
  const panel = document.getElementById("ai-widget-panel");
  const launcher = document.getElementById("ai-widget-launcher");
  if (!panel || !launcher) {
    return;
  }

  panel.classList.toggle("hidden", !open);
  launcher.setAttribute("aria-expanded", open ? "true" : "false");
}

function setModalOpen(id, open) {
  const modal = document.getElementById(id);
  if (!modal) {
    return;
  }

  modal.classList.toggle("hidden", !open);
}

function setVerificationStatus(text) {
  document.getElementById("account-verify-status").textContent = text;
}

function isEmailVerified() {
  return Boolean(state.user?.emailVerified);
}

function syncAiAvailability() {
  const disabled = !state.config?.openaiConfigured;
  const input = document.getElementById("ai-question");
  const sendButton = document.getElementById("ai-send-button");
  const resetButton = document.getElementById("ai-reset-button");

  input.disabled = disabled;
  sendButton.disabled = disabled;
  resetButton.disabled = disabled && !state.ai.messages.length;
  input.placeholder = disabled
    ? "Add OPENAI_API_KEY to turn on Ask Growr."
    : "Example: How is a 401(k) taxed compared with a Roth IRA?";

  document.querySelectorAll("[data-ai-question]").forEach((button) => {
    button.disabled = disabled;
  });
}

function hasInvestmentAccess() {
  return Boolean(state.user && state.user.plan === "bundle");
}

function formatTrialMessage(user = state.user) {
  if (!user?.trialActive) {
    return user?.subscriptionActive === false ? "Billing pending" : "Paid plan";
  }

  const daysRemaining = Math.max(Number(user.trialDaysRemaining || 0), 0);
  return daysRemaining <= 1 ? "Trial ends soon" : `${daysRemaining} trial days left`;
}

function getCurrentPlanKey(user = state.user) {
  if (!user) {
    return "budget";
  }

  if (user.plan === "bundle") {
    return "bundle";
  }

  return user.couplesAddOn ? "couples" : "budget";
}

function formatBillingAmount(amount, billingInterval = "monthly") {
  if (typeof amount !== "number") {
    return billingInterval === "yearly" ? "Yearly billing" : "Monthly billing";
  }

  return `${currency.format(amount)} / ${billingInterval === "yearly" ? "year" : "month"}`;
}

function formatBillingIntervalLabel(billingInterval = "monthly") {
  return billingInterval === "yearly" ? "Yearly billing" : "Monthly billing";
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
}

function toTitleCase(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAccountPlanDisplay(planKey = "budget", billingInterval = "monthly") {
  const catalog = {
    budget: {
      label: "Budget Core",
      monthly: "$5.99/month",
      yearly: "$57.50/year",
    },
    couples: {
      label: "Couples",
      monthly: "$8.99/month",
      yearly: "$86.30/year",
    },
    bundle: {
      label: "Budget + Investing",
      monthly: "$14.99/month",
      yearly: "$143.90/year",
    },
  };
  const entry = catalog[planKey] || catalog.budget;
  return {
    label: entry.label,
    priceLabel: billingInterval === "yearly" ? entry.yearly : entry.monthly,
  };
}

function refreshAccountPlanPreview() {
  const status = document.getElementById("account-plan-status");
  const note = document.getElementById("account-plan-interval-note");
  const changeButton = document.getElementById("account-change-plan-button");
  const selectedPlan =
    document.querySelector('input[name="accountPlan"]:checked')?.value || getCurrentPlanKey();
  const selectedBillingInterval =
    document.querySelector('input[name="accountBillingInterval"]:checked')?.value || state.user?.billingInterval || "monthly";
  const currentDisplay = getAccountPlanDisplay(getCurrentPlanKey(), state.user?.billingInterval || "monthly");

  if (!status || !note) {
    return;
  }

  const display = getAccountPlanDisplay(selectedPlan, selectedBillingInterval);
  const intervalPhrase = selectedBillingInterval === "yearly" ? "yearly billing" : "monthly billing";
  status.textContent = `${display.label} is selected on ${intervalPhrase}. Current plan: ${currentDisplay.label} on ${formatBillingIntervalLabel(state.user?.billingInterval || "monthly").toLowerCase()}.`;
  note.textContent = selectedBillingInterval === "yearly"
    ? `${display.label} renews at ${display.priceLabel}. Yearly billing keeps the 20% savings in place.`
    : `${display.label} renews at ${display.priceLabel}. Switch to yearly if you want the lower annual price.`;
  if (changeButton) {
    const isAlreadyCurrent = selectedPlan === getCurrentPlanKey() && selectedBillingInterval === (state.user?.billingInterval || "monthly");
    changeButton.textContent = isAlreadyCurrent ? "Current subscription" : "Save subscription change";
    changeButton.disabled = !state.user || isAlreadyCurrent;
  }
}

function renderBillingStatements(user = state.user) {
  const panel = document.getElementById("account-statements-panel");
  const status = document.getElementById("account-statements-status");
  const list = document.getElementById("account-statements-list");

  if (!panel || !status || !list) {
    return;
  }

  if (!user) {
    panel.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  const entries = Array.isArray(user.billingHistory) ? user.billingHistory : [];

  if (!entries.length) {
    status.textContent = "No billing activity yet. Your future trial, plan, and payment events will appear here.";
    list.innerHTML = "";
    return;
  }

  status.textContent = "Recent billing activity for your Growr subscription.";
  list.innerHTML = entries
    .map((entry) => {
      const dateLabel = entry.date
        ? new Date(entry.date).toLocaleDateString()
        : "Unknown date";
      const amountLabel = formatBillingAmount(entry.amount, entry.billingInterval);
      return `
        <article class="statement-item">
          <div class="statement-top">
            <div>
              <strong>${escapeHtml(entry.title || "Billing update")}</strong>
              <span>${escapeHtml(dateLabel)}</span>
            </div>
            <strong>${escapeHtml(entry.status || "info")}</strong>
          </div>
          <p class="statement-detail">${escapeHtml(entry.detail || "")}</p>
          <p class="statement-meta">${escapeHtml(amountLabel)}</p>
        </article>
      `;
    })
    .join("");
}

function populateAccountForm() {
  const nameInput = document.getElementById("accountFullName");
  const emailInput = document.getElementById("accountEmail");
  const accountForm = document.getElementById("account-form");
  const signedOutCard = document.getElementById("account-signed-out-card");
  const metaGrid = document.getElementById("account-meta-grid");
  const verifyCard = document.getElementById("account-verify-card");
  const primaryActions = document.getElementById("account-primary-actions");
  const saveButton = document.getElementById("account-save-button");
  const billingButton = document.getElementById("account-billing-button");
  const logoutButton = document.getElementById("account-logout-button");
  const resendButton = document.getElementById("account-resend-verification-button");
  const verifyButton = document.getElementById("account-verify-button");
  const verificationInput = document.getElementById("accountVerificationCode");
  const verificationForm = document.getElementById("account-verify-form");
  const verificationActions = document.getElementById("account-verify-actions");
  const planLabel = document.getElementById("accountPlanLabel");
  const trialLabel = document.getElementById("accountTrialLabel");
  const subscriptionLabel = document.getElementById("accountSubscriptionLabel");
  const billingIntervalLabel = document.getElementById("accountBillingIntervalLabel");
  const emailStatusLabel = document.getElementById("accountEmailStatusLabel");
  const verificationNote = document.getElementById("account-verify-note");
  const planPanel = document.getElementById("account-plan-panel");
  const planStatus = document.getElementById("account-plan-status");
  const planInputs = document.querySelectorAll('input[name="accountPlan"]');
  const billingIntervalInputs = document.querySelectorAll('input[name="accountBillingInterval"]');
  const billingIntervalNote = document.getElementById("account-plan-interval-note");
  const upgradePanel = document.getElementById("account-upgrade-panel");
  const upgradeCopy = document.getElementById("account-upgrade-copy");
  const billingPanel = document.getElementById("account-billing-panel");
  const billingHelp = document.getElementById("account-billing-help");
  const cancelButton = document.getElementById("account-cancel-plan-button");

  if (!state.user) {
    nameInput.value = "";
    emailInput.value = "";
    accountForm.classList.add("hidden");
    signedOutCard.classList.remove("hidden");
    metaGrid.classList.add("hidden");
    verifyCard.classList.add("hidden");
    primaryActions.classList.add("hidden");
    nameInput.disabled = true;
    emailInput.disabled = true;
    saveButton.disabled = true;
    billingButton.disabled = true;
    logoutButton.disabled = true;
    resendButton.disabled = true;
    verifyButton.disabled = true;
    verificationInput.disabled = true;
    verificationInput.value = "";
    verificationForm.classList.remove("hidden");
    verificationActions.classList.remove("hidden");
    planLabel.textContent = "Signed out";
    trialLabel.textContent = "Unavailable";
    subscriptionLabel.textContent = "Unavailable";
    billingIntervalLabel.textContent = "Unavailable";
    emailStatusLabel.textContent = "Unavailable";
    verificationNote.classList.add("hidden");
    planPanel.classList.add("hidden");
    planStatus.textContent = "Sign in to change your subscription.";
    billingIntervalNote.textContent = "Choose monthly or yearly billing for the plan you want.";
    planInputs.forEach((input) => {
      input.checked = input.value === "budget";
      input.disabled = true;
    });
    billingIntervalInputs.forEach((input) => {
      input.checked = input.value === "monthly";
      input.disabled = true;
    });
    upgradePanel.classList.add("hidden");
    billingPanel.classList.add("hidden");
    billingHelp.classList.add("hidden");
    cancelButton.disabled = true;
    renderBillingStatements(null);
    setAccountStatus("Sign in to update your account details.");
    setVerificationStatus("Sign in to manage email verification.");
    updatePlannerActionState();
    return;
  }

  accountForm.classList.remove("hidden");
  signedOutCard.classList.add("hidden");
  metaGrid.classList.remove("hidden");
  verifyCard.classList.remove("hidden");
  primaryActions.classList.remove("hidden");
  planPanel.classList.remove("hidden");
  billingPanel.classList.remove("hidden");
  billingHelp.classList.toggle("hidden", !state.config?.stripeApiConfigured);
  cancelButton.disabled = false;
  nameInput.disabled = false;
  emailInput.disabled = false;
  saveButton.disabled = false;
  billingButton.disabled = !state.config?.stripeApiConfigured;
  logoutButton.disabled = false;
  resendButton.disabled = false;
  verifyButton.disabled = false;
  verificationInput.disabled = false;
  nameInput.value = state.user.fullName || "";
  emailInput.value = state.user.email || "";
  planLabel.textContent = state.user.plan === "bundle"
    ? "Budget + Investing"
    : state.user.couplesAddOn
      ? "Couples"
      : "Budget Core";
  trialLabel.textContent = state.user.trialActive
    ? `${Math.max(Number(state.user.trialDaysRemaining || 0), 0)} days left`
    : "No active trial";
  subscriptionLabel.textContent = state.user.subscriptionActive === false ? "Pending" : "Active";
  billingIntervalLabel.textContent = formatBillingIntervalLabel(state.user.billingInterval);
  emailStatusLabel.textContent = state.user.emailVerified ? "Verified" : "Needs verification";
  const currentPlanKey = getCurrentPlanKey();
  planInputs.forEach((input) => {
    input.checked = input.value === currentPlanKey;
    input.disabled = false;
    const card = input.nextElementSibling;
    if (card) {
      card.dataset.current = input.value === currentPlanKey ? "true" : "false";
    }
  });
  billingIntervalInputs.forEach((input) => {
    input.checked = input.value === (state.user.billingInterval || "monthly");
    input.disabled = false;
  });
  refreshAccountPlanPreview();
  verificationNote.classList.remove("hidden");
  if (state.user.emailVerified) {
    verificationForm.classList.add("hidden");
    verificationActions.classList.add("hidden");
    verificationInput.value = "";
    verificationInput.disabled = true;
    resendButton.disabled = true;
    verifyButton.disabled = true;
    verificationNote.textContent = "Your email is already verified, so you do not need to enter or resend a code.";
  } else {
    verificationForm.classList.remove("hidden");
    verificationActions.classList.remove("hidden");
    verificationInput.disabled = false;
    resendButton.disabled = false;
    verifyButton.disabled = false;
    verificationNote.textContent = state.config?.emailConfigured
      ? "We can send a verification code to this email so the account feels more secure and recoverable."
      : "Email delivery is not connected yet, so verification will stay in app until a provider is added.";
  }
  if (state.user.plan !== "bundle") {
    upgradePanel.classList.remove("hidden");
    upgradeCopy.textContent = state.user.trialActive
      ? `Your trial is live. Upgrade to Budget + Investing for $14.99/month, with couples included, or save 20% with annual billing before it ends.`
      : `Move to Budget + Investing for $14.99/month, with couples included, or save 20% with annual billing to unlock forecasts, retirement planning, and investment-linked account views.`;
  } else {
    upgradePanel.classList.add("hidden");
  }
  setAccountStatus(
    state.user.trialActive
      ? `Signed in. Your free trial ends ${new Date(state.user.trialEndsAt).toLocaleDateString()}.`
      : "Signed in. Update your profile or manage your subscription here."
  );
  setVerificationStatus(
    state.user.emailVerified
      ? "Your email is verified."
      : "Your email is not verified yet. Send a code, then enter it here."
  );
  billingButton.classList.toggle("hidden", !state.config?.stripeApiConfigured);
  billingHelp.classList.toggle("hidden", !state.config?.stripeApiConfigured);
  renderBillingStatements(state.user);
  updatePlannerActionState();
}

function handleCancelSubscription() {
  if (!state.user) {
    setAccountStatus("Sign in before canceling your subscription.");
    return;
  }

  setModalOpen("subscription-cancel-modal", true);
}

function finishSubscriptionCancellation(action = "cancel") {
  return fetch("/api/account/cancel-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  })
    .then(async (response) => {
      const payload = await readJsonResponse(
        response,
        "Growr could not update this subscription right now. Refresh the page and try again."
      );
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update subscription.");
      }
      state.user = payload.account;
      populateAccountForm();
      renderAccountState();
      updateDashboard();
      setAccountStatus(payload.message);
      document.getElementById("account-plan-status").textContent = payload.message;
    })
    .catch((error) => {
      setAccountStatus(error.message);
      document.getElementById("account-plan-status").textContent = error.message;
    });
}

function getDefaultAiEmptyState() {
  const personalized = state.user
    ? "Ask about your own budget too, like whether to focus on debt, savings, or investing next."
    : "If you sign in, I can also use your saved numbers for more personal answers.";

  return `
    <article class="ai-message assistant ai-message-intro">
      <div class="ai-message-header">
        <strong>Growr</strong>
        <span>Finance coach</span>
      </div>
      <p>Hi, I’m Growr. I’m here to answer money questions about budgeting, debt, subscriptions, taxes, retirement, investing, and accounts. ${personalized}</p>
    </article>
  `;
}

function renderAiCoachHighlights({
  debtRatio = 0,
  leftover = 0,
  recurringTotal = 0,
  retirementGap = null,
  hasInvestmentAccess: investmentAccess = false,
} = {}) {
  const mode = document.getElementById("ai-highlight-mode");
  const pressure = document.getElementById("ai-highlight-pressure");
  const recurring = document.getElementById("ai-highlight-recurring");
  const retirement = document.getElementById("ai-highlight-retirement");

  if (!mode || !pressure || !recurring || !retirement) {
    return;
  }

  mode.textContent = state.user
    ? state.config?.openaiConfigured
      ? "Plan-aware money coach"
      : "Coach UI ready"
    : "General money explainer";

  if (leftover < 0) {
    pressure.textContent = "Monthly shortfall";
  } else if (debtRatio > 0.35) {
    pressure.textContent = "Debt is heavy";
  } else if (debtRatio > 0.2) {
    pressure.textContent = "Debt needs watching";
  } else {
    pressure.textContent = "Fairly stable";
  }

  recurring.textContent = recurringTotal > 0 ? currency.format(recurringTotal) : "Needs linked data";

  if (!investmentAccess) {
    retirement.textContent = "Bundle feature";
  } else if (retirementGap === null || Number.isNaN(retirementGap)) {
    retirement.textContent = "Needs setup";
  } else if (retirementGap > 0) {
    retirement.textContent = `${currency.format(retirementGap)} short`;
  } else {
    retirement.textContent = "On track";
  }
}

function renderCouplesExperience({
  householdCash = 0,
  householdNetWorth = 0,
  recurringLoad = 0,
  householdInvesting = 0,
  nextMove = "Review setup",
} = {}) {
  const accessNote = document.getElementById("couples-access-note");
  const headline = document.getElementById("couples-shared-headline");
  const copy = document.getElementById("couples-shared-copy");
  const reviewList = document.getElementById("couples-review-list");

  if (!accessNote || !headline || !copy || !reviewList) {
    return;
  }

  const hasUser = Boolean(state.user);
  const hasCouples = Boolean(state.user?.couplesAddOn);

  document.getElementById("couples-household-cash").textContent = currency.format(householdCash);
  document.getElementById("couples-household-networth").textContent = currency.format(householdNetWorth);
  document.getElementById("couples-household-recurring").textContent = currency.format(recurringLoad);
  document.getElementById("couples-household-investing").textContent = currency.format(householdInvesting);
  document.getElementById("couples-mock-cash").textContent = currency.format(householdCash);
  document.getElementById("couples-mock-bills").textContent = currency.format(recurringLoad);
  document.getElementById("couples-mock-next").textContent = nextMove;

  if (!hasUser) {
    accessNote.classList.remove("hidden");
    accessNote.textContent = "Sign in to turn on shared household planning and see how Growr would summarize your money as a couple.";
    headline.textContent = "Bring both sides of the money picture together.";
    copy.textContent = "The Couples package gives one household view for recurring bills, cash, and next moves without losing each person's separate accounts.";
  } else if (!hasCouples) {
    accessNote.classList.remove("hidden");
    accessNote.textContent = "Move to the Couples package for $8.99/month to unlock a shared household view, recurring review together, and faster monthly money check-ins.";
    headline.textContent = "Your plan is ready to expand into a household view.";
    copy.textContent = "Growr can already estimate your household picture from the current plan. Turn on Couples to make the shared version part of your account.";
  } else {
    accessNote.classList.remove("hidden");
    accessNote.textContent = state.user?.plan === "bundle"
      ? "Budget + Investing includes couples already. Shared invites and partner permissions are the next step, but your household view is already on."
      : "Couples is active. Shared invites and partner permissions are the next step, but your household view is already on.";
    headline.textContent = "The household view is active and ready for money check-ins.";
    copy.textContent = "Use this page to keep shared bills, cash, and long-term progress in one simpler household picture.";
  }

  const reviewItems = [
    {
      title: recurringLoad > 0 ? "Review recurring bills together" : "Connect recurring data",
      body: recurringLoad > 0
        ? `${currency.format(recurringLoad)} is currently being treated as the repeating monthly household load, which makes it the easiest first check-in topic.`
        : "Connect accounts and refresh data so Growr can separate subscriptions, bills, and paychecks automatically for the household.",
    },
    {
      title: householdCash > 0 ? "Decide what shared cash should do next" : "Build visible household cash",
      body: householdCash > 0
        ? `${currency.format(householdCash)} is showing up as available household cash. Decide together how much stays liquid versus moving toward goals or debt payoff.`
        : "Once cash accounts are connected or entered, Growr can give the household a clearer monthly buffer view.",
    },
    {
      title: householdNetWorth > 0 ? "Track progress as a team" : "Start the long-term household picture",
      body: householdNetWorth > 0
        ? `${currency.format(householdNetWorth)} is the current combined net worth picture Growr can see. That gives both people one shared scoreboard to review over time.`
        : "Add home, car, debt, and investment details so the couples view shows a fuller long-term picture, not just month-to-month spending.",
    },
  ];

  reviewList.innerHTML = reviewItems
    .map(
      (item, index) => `
        <article class="couples-review-item">
          <div class="couples-review-badge">${index + 1}</div>
          <div>
            <h4>${item.title}</h4>
            <p>${item.body}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAiMessages() {
  const thread = document.getElementById("ai-thread");
  if (!state.ai.messages.length && !state.ai.isLoading) {
    thread.innerHTML = getDefaultAiEmptyState();
    return;
  }

  const messagesMarkup = state.ai.messages
    .map(
      (message) => `
        <article class="ai-message ${message.role}">
          <div class="ai-message-header">
            <strong>${message.role === "user" ? "You" : "Growr"}</strong>
          </div>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `
    )
    .join("");

  const typingMarkup = state.ai.isLoading
    ? `
      <article class="ai-message assistant typing">
        <div class="ai-message-header">
          <strong>Growr</strong>
          <span>Typing...</span>
        </div>
        <div class="ai-typing-dots" aria-label="Growr is typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </article>
    `
    : "";

  thread.innerHTML = messagesMarkup + typingMarkup;
  thread.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
}

function resetAiCoach() {
  state.ai.previousResponseId = null;
  state.ai.messages = [];
  state.ai.isLoading = false;
  document.getElementById("ai-question").value = "";
  setAiStatus(
    state.config?.openaiConfigured
      ? "Ask money questions anytime. If you are signed in, Growr can also answer using your saved plan."
      : "Ask Growr needs an OpenAI API key before it can reply."
  );
  renderAiMessages();
  syncAiAvailability();
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
    retirementAge: getValue("retirementAge"),
    retirementMonthlyGoal: getValue("retirementMonthlyGoal"),
    retirementIncomeOther: getValue("retirementIncomeOther"),
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
  const accountNavButton = document.getElementById("account-nav-button");
  const loginNavButton = document.getElementById("login-nav-button");
  const signupNavButton = document.getElementById("signup-nav-button");

  if (!state.user) {
    accountNavButton.classList.add("hidden");
    loginNavButton.classList.remove("hidden");
    signupNavButton.classList.remove("hidden");
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
    if (!state.ai.messages.length) {
      renderAiMessages();
    }
    return;
  }

  accountNavButton.classList.remove("hidden");
  loginNavButton.classList.add("hidden");
  signupNavButton.classList.add("hidden");
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
      `${state.user.plan === "bundle" ? "Budget + Investing" : state.user.couplesAddOn ? "Couples" : "Budget Core"}`
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
  if (!state.ai.messages.length) {
    renderAiMessages();
  }
}

function setPlaidMessage(text) {
  const message = document.getElementById("plaid-message");
  message.classList.remove("hidden");
  message.textContent = text;
}

function toggleResetMode(showReset) {
  document.getElementById("login-form").classList.toggle("hidden", showReset);
  document.getElementById("reset-request-form").classList.toggle("hidden", !showReset);
}

function renderList(containerId, rows, emptyText) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `
      <div class="linked-item empty-state">
        <strong>Nothing here yet</strong>
        <p>${emptyText}</p>
      </div>
    `;
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

function normalizeMerchantName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function groupTransactionsByMonth(transactions) {
  return transactions.reduce((groups, transaction) => {
    const date = new Date(transaction.date);
    if (Number.isNaN(date.getTime())) {
      return groups;
    }

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(transaction);
    return groups;
  }, {});
}

function getPeriodRange(period = "month", offset = 0) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (period === "week") {
    const day = base.getDay();
    const mondayOffset = (day + 6) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - mondayOffset + offset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor(base.getMonth() / 3) * 3 + offset * 3;
    const start = new Date(base.getFullYear(), quarterStartMonth, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
    return { start, end };
  }

  if (period === "year") {
    const start = new Date(base.getFullYear() + offset, 0, 1);
    const end = new Date(start.getFullYear() + 1, 0, 1);
    return { start, end };
  }

  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start, end };
}

function formatPeriodLabel(period = "month", offset = 0) {
  const { start, end } = getPeriodRange(period, offset);
  const today = new Date();
  const isCurrent =
    offset === 0 &&
    today >= start &&
    today < end &&
    ((period === "week") || (period === "month") || (period === "quarter") || (period === "year"));

  if (period === "week") {
    if (isCurrent) {
      return "This week";
    }
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(
      end.getTime() - 24 * 60 * 60 * 1000
    ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  if (period === "quarter") {
    const quarter = Math.floor(start.getMonth() / 3) + 1;
    return isCurrent ? `This quarter` : `Q${quarter} ${start.getFullYear()}`;
  }

  if (period === "year") {
    return isCurrent ? "This year" : String(start.getFullYear());
  }

  return isCurrent
    ? "This month"
    : start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getTransactionsForPeriod(period = state.spendingPeriod, offset = state.spendingOffset) {
  const { start, end } = getPeriodRange(period, offset);
  return state.transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return !Number.isNaN(date.getTime()) && date >= start && date < end;
  });
}

function buildMonthlyAutomationData() {
  const transactions = state.transactions
    .slice()
    .filter((transaction) => transaction && transaction.date)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  const monthGroups = groupTransactionsByMonth(transactions);
  const monthKeys = Object.keys(monthGroups).sort();
  const recentKeys = monthKeys.slice(-6);
  const monthlySeries = recentKeys.map((key) => {
    const items = monthGroups[key];
    const spend = items
      .filter((entry) => Number(entry.amount || 0) > 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const income = Math.abs(
      items
        .filter((entry) => Number(entry.amount || 0) < 0)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );
    return {
      key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
      }),
      spend,
      income,
      net: income - spend,
    };
  });

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthTransactions = monthGroups[currentKey] || [];
  const currentMonthSpend = currentMonthTransactions
    .filter((entry) => Number(entry.amount || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const currentMonthIncome = Math.abs(
    currentMonthTransactions
      .filter((entry) => Number(entry.amount || 0) < 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );
  const currentCategorySpend = currentMonthTransactions
    .filter((entry) => Number(entry.amount || 0) > 0)
    .reduce((totals, entry) => {
      const key = entry.category || "other";
      totals[key] = (totals[key] || 0) + Number(entry.amount || 0);
      return totals;
    }, {});

  const recurringTotal =
    state.subscriptions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0) +
    state.recurringBills.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0);
  const flexibleSpend =
    (currentCategorySpend.fun || 0) +
    (currentCategorySpend.other || 0) +
    Math.max((currentCategorySpend.essentials || 0) - recurringTotal * 0.15, 0);

  const depositGroups = transactions
    .filter((entry) => Number(entry.amount || 0) < 0)
    .reduce((groups, entry) => {
      const key = normalizeMerchantName(entry.merchant);
      if (!key) {
        return groups;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(entry);
      return groups;
    }, {});

  const recurringIncomeCandidates = state.recurringIncome.length
    ? state.recurringIncome.map((entry) => ({
        merchant: entry.merchant,
        averageInterval: entry.averageIntervalDays || 30,
        averageAmount: entry.averageAmount || 0,
        nextDate: entry.nextExpectedDate ? new Date(entry.nextExpectedDate) : null,
        daysUntil: entry.nextExpectedDate
          ? Math.round((new Date(entry.nextExpectedDate) - now) / (1000 * 60 * 60 * 24))
          : null,
        count: entry.transactionsCount || 0,
        estimatedMonthlyIncome: entry.estimatedMonthlyIncome || 0,
      }))
    : Object.entries(depositGroups)
    .map(([merchantKey, entries]) => {
      const sorted = entries
        .slice()
        .sort((left, right) => new Date(left.date) - new Date(right.date));
      if (sorted.length < 2) {
        return null;
      }
      const intervals = [];
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = new Date(sorted[index - 1].date);
        const current = new Date(sorted[index].date);
        intervals.push((current - previous) / (1000 * 60 * 60 * 24));
      }
      const averageInterval =
        intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
      if (!(averageInterval >= 10 && averageInterval <= 35)) {
        return null;
      }

      const averageAmount =
        Math.abs(sorted.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)) /
        sorted.length;
      const lastDate = new Date(sorted[sorted.length - 1].date);
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + Math.round(averageInterval));
      const daysUntil = Math.round((nextDate - now) / (1000 * 60 * 60 * 24));

      return {
        merchant: sorted[sorted.length - 1].merchant || merchantKey,
        averageInterval,
        averageAmount,
        nextDate,
        daysUntil,
        count: sorted.length,
        estimatedMonthlyIncome: averageAmount * (30 / Math.max(averageInterval || 30, 1)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.count - left.count || left.daysUntil - right.daysUntil);

  return {
    monthlySeries,
    currentMonthSpend,
    currentMonthIncome,
    currentCategorySpend,
    recurringTotal,
    flexibleSpend,
    recurringIncome: recurringIncomeCandidates[0] || null,
  };
}

function renderSpendingOverview() {
  const periodLabel = document.getElementById("spending-period-label");
  if (!periodLabel) {
    return;
  }

  const filtered = getTransactionsForPeriod();
  const periodIncome = Math.abs(
    filtered
      .filter((entry) => Number(entry.amount || 0) < 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );
  const periodSpend = filtered
    .filter((entry) => Number(entry.amount || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const netIncome = periodIncome - periodSpend;
  const byCategory = filtered
    .filter((entry) => Number(entry.amount || 0) > 0)
    .reduce((totals, entry) => {
      const key = entry.category || "other";
      totals[key] = (totals[key] || 0) + Number(entry.amount || 0);
      return totals;
    }, {});

  periodLabel.textContent = formatPeriodLabel();
  document.getElementById("auto-income-total").textContent = currency.format(periodIncome);
  document.getElementById("auto-spend-total").textContent = currency.format(periodSpend);
  document.getElementById("auto-net-total").textContent = currency.format(netIncome);

  const topCategoryEntry = Object.entries(byCategory).sort((left, right) => right[1] - left[1])[0];
  document.getElementById("auto-pressure-hint").textContent = topCategoryEntry
    ? `${formatCategoryLabel(topCategoryEntry[0])} ${currency.format(topCategoryEntry[1])}`
    : "Waiting on data";
  document.getElementById("auto-flex-total").textContent = topCategoryEntry
    ? `Trim ${formatCategoryLabel(topCategoryEntry[0])}`
    : "Review top category";

  const priorOffset = state.spendingOffset - 1;
  const priorTransactions = getTransactionsForPeriod(state.spendingPeriod, priorOffset);
  const priorSpend = priorTransactions
    .filter((entry) => Number(entry.amount || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const spendDifference = periodSpend - priorSpend;
  document.getElementById("auto-trend-hint").textContent = priorTransactions.length
    ? spendDifference === 0
      ? "Flat vs last period"
      : `${currency.format(Math.abs(spendDifference))} ${spendDifference > 0 ? "higher" : "lower"}`
    : "Waiting on data";

  document.getElementById("auto-payday-hint").textContent = filtered.length
    ? formatPeriodLabel()
    : "Need transaction history";

  renderCategoryDonutChart(byCategory, periodSpend);
  updateSpendingPeriodControls();
}

function updateSpendingPeriodControls() {
  const label = document.getElementById("spending-period-label");
  if (!label) {
    return;
  }

  label.textContent = formatPeriodLabel();
  document.querySelectorAll("[data-spending-period]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.spendingPeriod === state.spendingPeriod);
  });
}

function renderMonthlyTrendChart(series) {
  const chart = document.getElementById("monthly-trend-chart");
  const label = document.getElementById("monthly-trend-label");
  const note = document.getElementById("monthly-trend-note");
  const insights = document.getElementById("monthly-trend-insights");

  if (!series.length) {
    chart.innerHTML = "";
    label.textContent = "$0";
    note.textContent = "Import or add transactions to let Growr build a monthly trend.";
    if (insights) {
      insights.innerHTML = `
        <span class="insight-chip">This month: $0</span>
        <span class="insight-chip">Last month: $0</span>
        <span class="insight-chip">Trend: Needs data</span>
      `;
    }
    return;
  }

  const width = 420;
  const height = 220;
  const padding = 20;
  const maxValue = Math.max(...series.map((point) => Math.max(point.spend, point.income, 1)));
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const toPoint = (value, index) => {
    const x = padding + stepX * index;
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    return `${x},${y}`;
  };
  const spendPoints = series.map((point, index) => toPoint(point.spend, index)).join(" ");
  const incomePoints = series.map((point, index) => toPoint(point.income, index)).join(" ");
  const spendNodes = series.map((point, index) => {
    const [x, y] = toPoint(point.spend, index).split(",").map(Number);
    return { x, y };
  });
  const incomeNodes = series.map((point, index) => {
    const [x, y] = toPoint(point.income, index).split(",").map(Number);
    return { x, y };
  });
  const smoothPath = (nodes) => {
    if (nodes.length === 1) {
      return `M ${nodes[0].x} ${nodes[0].y}`;
    }
    return nodes.reduce((path, node, index) => {
      if (index === 0) {
        return `M ${node.x} ${node.y}`;
      }
      const previous = nodes[index - 1];
      const midX = (previous.x + node.x) / 2;
      return `${path} C ${midX} ${previous.y}, ${midX} ${node.y}, ${node.x} ${node.y}`;
    }, "");
  };
  const spendArea = [
    `${padding},${height - padding}`,
    ...series.map((point, index) => toPoint(point.spend, index)),
    `${padding + stepX * (series.length - 1)},${height - padding}`,
  ].join(" ");
  const incomeArea = [
    `${padding},${height - padding}`,
    ...series.map((point, index) => toPoint(point.income, index)),
    `${padding + stepX * (series.length - 1)},${height - padding}`,
  ].join(" ");
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const trendDelta = previous ? latest.spend - previous.spend : 0;

  chart.innerHTML = `
    <defs>
      <linearGradient id="growrSpendFill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ff5a36" stop-opacity="0.24"></stop>
        <stop offset="100%" stop-color="#ff5a36" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="growrIncomeFill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#3867ff" stop-opacity="0.22"></stop>
        <stop offset="100%" stop-color="#3867ff" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="growrSpendLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff5a36"></stop>
        <stop offset="100%" stop-color="#ff8b70"></stop>
      </linearGradient>
      <linearGradient id="growrIncomeLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3867ff"></stop>
        <stop offset="100%" stop-color="#6c8cff"></stop>
      </linearGradient>
    </defs>
    ${[0.25, 0.5, 0.75]
      .map((ratio) => {
        const y = height - padding - ratio * (height - padding * 2);
        return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#eef2f8" stroke-width="1"></line>`;
      })
      .join("")}
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d9e0ea" stroke-width="1.5"></line>
    <polygon points="${incomeArea}" fill="url(#growrIncomeFill)"></polygon>
    <polygon points="${spendArea}" fill="url(#growrSpendFill)"></polygon>
    ${series
      .map((point, index) => {
        const x = padding + stepX * index;
        return `
          <text x="${x}" y="${height - 2}" text-anchor="middle" fill="#7a8599" font-size="12">${point.label}</text>
        `;
      })
      .join("")}
    <path d="${smoothPath(incomeNodes)}" fill="none" stroke="url(#growrIncomeLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="${smoothPath(spendNodes)}" fill="none" stroke="url(#growrSpendLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${series
      .map((point, index) => {
        const incomePoint = toPoint(point.income, index).split(",");
        const spendPoint = toPoint(point.spend, index).split(",");
        return `
          <circle cx="${incomePoint[0]}" cy="${incomePoint[1]}" r="4.5" fill="#3867ff"></circle>
          <circle cx="${spendPoint[0]}" cy="${spendPoint[1]}" r="4.5" fill="#ff5a36"></circle>
        `;
      })
      .join("")}
    ${incomeNodes.length ? `<circle cx="${incomeNodes[incomeNodes.length - 1].x}" cy="${incomeNodes[incomeNodes.length - 1].y}" r="6" fill="#3867ff" stroke="#ffffff" stroke-width="3"></circle>` : ""}
    ${spendNodes.length ? `<circle cx="${spendNodes[spendNodes.length - 1].x}" cy="${spendNodes[spendNodes.length - 1].y}" r="6" fill="#ff5a36" stroke="#ffffff" stroke-width="3"></circle>` : ""}
  `;

  label.textContent = currency.format(latest.spend);
  note.textContent = previous
    ? trendDelta > 0
      ? `Spending is up ${currency.format(Math.abs(trendDelta))} versus ${previous.label}.`
      : `Spending is down ${currency.format(Math.abs(trendDelta))} versus ${previous.label}.`
    : "Growr will compare new months here as soon as more history comes in.";
  if (insights) {
    insights.innerHTML = `
      <span class="insight-chip">This month: ${currency.format(latest.spend)}</span>
      <span class="insight-chip">Last month: ${currency.format(previous ? previous.spend : 0)}</span>
      <span class="insight-chip">Trend: ${previous ? (trendDelta > 0 ? "Spending is climbing" : trendDelta < 0 ? "Spending is easing" : "Holding steady") : "Needs more history"}</span>
    `;
  }
}

function renderProjectionLineChart({
  chartId,
  labelId,
  noteId,
  series,
  lineColor,
  fillColor,
  labelFormatter = currency.format,
  noteText = "",
}) {
  const chart = document.getElementById(chartId);
  const label = document.getElementById(labelId);
  const note = document.getElementById(noteId);

  if (!series.length) {
    chart.innerHTML = "";
    label.textContent = "$0";
    note.textContent = noteText || "Add more data to see this projection.";
    return;
  }

  const width = 420;
  const height = 240;
  const paddingX = 22;
  const paddingY = 22;
  const maxValue = Math.max(...series.map((point) => point.value), 1);
  const stepX = series.length > 1 ? (width - paddingX * 2) / (series.length - 1) : 0;
  const points = series.map((point, index) => {
    const x = paddingX + stepX * index;
    const y = height - paddingY - (point.value / maxValue) * (height - paddingY * 2);
    return { ...point, x, y };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const smoothPath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const areaPoints = [
    `${points[0].x},${height - paddingY}`,
    ...points.map((point) => `${point.x},${point.y}`),
    `${points[points.length - 1].x},${height - paddingY}`,
  ].join(" ");

  chart.innerHTML = `
    <defs>
      <linearGradient id="${chartId}-fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${fillColor}" stop-opacity="0.36"></stop>
        <stop offset="100%" stop-color="${fillColor}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${[0.25, 0.5, 0.75]
      .map((ratio) => {
        const y = height - paddingY - ratio * (height - paddingY * 2);
        return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="#eef2f8" stroke-width="1"></line>`;
      })
      .join("")}
    <polygon points="${areaPoints}" fill="url(#${chartId}-fill)"></polygon>
    <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="#d9e0ea" stroke-width="1.5"></line>
    <path d="${smoothPath}" fill="none" stroke="${lineColor}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"></path>
    ${points
      .map(
        (point) => `
          <circle cx="${point.x}" cy="${point.y}" r="${point === points[points.length - 1] ? 6 : 5}" fill="${lineColor}" ${point === points[points.length - 1] ? 'stroke="#ffffff" stroke-width="3"' : ""}></circle>
          <text x="${point.x}" y="${height - 4}" text-anchor="middle" fill="#7a8599" font-size="12">${point.label}</text>
        `
      )
      .join("")}
  `;

  label.textContent = labelFormatter(series[series.length - 1].value);
  note.textContent = noteText;
}

function renderCategoryDonut(categorySpend) {
  const chart = document.getElementById("category-donut-chart");
  const center = document.getElementById("category-donut-center");
  const label = document.getElementById("category-donut-label");
  const legend = document.getElementById("category-donut-legend");
  const insights = document.getElementById("category-donut-insights");
  const entries = Object.entries(categorySpend)
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1]);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);

  if (!total) {
    chart.style.background = "conic-gradient(#edf1f6 0deg, #edf1f6 360deg)";
    center.textContent = "$0";
    label.textContent = "$0";
    legend.innerHTML = `<div class="linked-item empty-state"><strong>No category chart yet</strong><p>Add or import transactions to see this month take shape.</p></div>`;
    if (insights) {
      insights.innerHTML = `
        <span class="insight-chip">Top category: Waiting on data</span>
        <span class="insight-chip">Share: 0%</span>
      `;
    }
    return;
  }

  let angle = 0;
  const stops = entries.map(([key, amount]) => {
    const nextAngle = angle + (amount / total) * 360;
    const color = chartSolidPalette[key] || chartSolidPalette.other;
    const stop = `${color} ${angle}deg ${nextAngle}deg`;
    angle = nextAngle;
    return stop;
  });

  chart.style.background = `conic-gradient(${stops.join(", ")})`;
  center.textContent = currency.format(total);
  label.textContent = currency.format(total);
  legend.innerHTML = entries
    .map(([key, amount]) => {
      const color = chartPalette[key] || chartPalette.other;
      return `
        <div class="legend-item">
          <span class="legend-dot" style="background:${color}"></span>
          <p>${key}</p>
          <strong>${currency.format(amount)}</strong>
        </div>
      `;
    })
    .join("");
  if (insights) {
    const [topKey, topAmount] = entries[0];
    insights.innerHTML = `
      <span class="insight-chip">Top category: ${toTitleCase(topKey)}</span>
      <span class="insight-chip">Share: ${percent.format(topAmount / total)}</span>
    `;
  }
}

function renderAutomationHub() {
  const data = buildMonthlyAutomationData();
  const topCategoryEntry = Object.entries(data.currentCategorySpend).sort((left, right) => right[1] - left[1])[0];
  const latestSeries = data.monthlySeries[data.monthlySeries.length - 1];
  const priorSeries = data.monthlySeries[data.monthlySeries.length - 2];

  document.getElementById("auto-spend-total").textContent = currency.format(data.currentMonthSpend);
  document.getElementById("auto-income-total").textContent = currency.format(data.currentMonthIncome);
  document.getElementById("auto-recurring-total").textContent = currency.format(data.recurringTotal);
  document.getElementById("auto-flex-total").textContent = currency.format(data.flexibleSpend);
  document.getElementById("auto-payday-hint").textContent = data.recurringIncome
    ? data.recurringIncome.daysUntil >= 0
      ? `${data.recurringIncome.merchant} likely in ${data.recurringIncome.daysUntil} days`
      : `${data.recurringIncome.merchant} looks like a recurring deposit`
    : "Need linked deposits";
  document.getElementById("auto-pressure-hint").textContent = topCategoryEntry
    ? `${topCategoryEntry[0]} is leading at ${currency.format(topCategoryEntry[1])}`
    : "Waiting on category data";
  document.getElementById("auto-trend-hint").textContent =
    latestSeries && priorSeries
      ? latestSeries.spend > priorSeries.spend
        ? "Spending is trending up"
        : "Spending is settling down"
      : "Need more monthly history";

  renderMonthlyTrendChart(data.monthlySeries);
  renderCategoryDonut(data.currentCategorySpend);
}

function renderTransactionMonthGroups(transactions) {
  const container = document.getElementById("transaction-month-groups");
  const monthGroups = groupTransactionsByMonth(transactions);
  const monthKeys = Object.keys(monthGroups).sort((left, right) => right.localeCompare(left)).slice(0, 4);

  if (!monthKeys.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = monthKeys
    .map((key) => {
      const items = monthGroups[key];
      const spend = items
        .filter((entry) => Number(entry.amount || 0) > 0)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const income = Math.abs(
        items
          .filter((entry) => Number(entry.amount || 0) < 0)
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      );
      const label = new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      return `
        <article class="month-chip">
          <span>${label}</span>
          <strong>${currency.format(spend)}</strong>
          <p>${currency.format(income)} in deposits · ${currency.format(income - spend)} net</p>
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
    container.innerHTML = `
      <div class="transaction-item empty-state">
        <strong>No transactions yet</strong>
        <p>Add one manually or refresh connected data to start building your monthly view.</p>
      </div>
    `;
    updateTransactionSummary(filteredTransactions);
    renderTransactionMonthGroups(state.transactions);
    renderAutomationHub();
    return;
  }

  const groupedTransactions = filteredTransactions.reduce((groups, transaction) => {
    const date = new Date(transaction.date);
    const monthLabel = Number.isNaN(date.getTime())
      ? "Unknown month"
      : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups[monthLabel]) {
      groups[monthLabel] = [];
    }
    groups[monthLabel].push(transaction);
    return groups;
  }, {});

  container.innerHTML = Object.entries(groupedTransactions)
    .map(([monthLabel, transactions]) => {
      const monthTotal = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      return `
        <section class="transaction-month-section">
          <div class="transaction-month-header">
            <div>
              <span>${monthLabel}</span>
              <strong>${transactions.length} transactions</strong>
            </div>
            <strong>${monthTotal < 0 ? `${currency.format(Math.abs(monthTotal))} in` : currency.format(monthTotal)}</strong>
          </div>
          <div class="transaction-month-stack">
            ${transactions
              .map((transaction) => {
                const merchantName = formatMerchantName(transaction.merchant);
                const merchantLabel = getMerchantBadge(transaction.merchant);
                const sourceLabel = transaction.source === "plaid" ? "Connected" : "Manual";
                const categoryLabel = formatCategoryLabel(transaction.category);
                const recurringLabel =
                  transaction.subscriptionStatus === "subscribed"
                    ? "Subscription"
                    : transaction.subscriptionStatus === "ignored"
                      ? "One-time"
                      : "Auto review";
                return `
                  <article class="transaction-item premium-transaction-item">
                    <div class="transaction-main-row">
                      ${renderIdentityBadge(transaction.merchant, "transaction-avatar")}
                      <div class="transaction-main-copy">
                        <div class="transaction-top">
                          <h3>${merchantName}</h3>
                          <strong class="${Number(transaction.amount || 0) < 0 ? "money-in" : "money-out"}">${currency.format(transaction.amount)}</strong>
                        </div>
                        <p>${categoryLabel} · ${sourceLabel} · ${formatTransactionDate(transaction.date)}</p>
                        <div class="transaction-badge-row">
                          <span class="transaction-badge">${recurringLabel}</span>
                          <span class="transaction-badge transaction-badge-muted">${sourceLabel}</span>
                          <span class="transaction-badge transaction-badge-muted">${categoryLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div class="transaction-review-row">
                      <label>
                        Category
                        <select data-transaction-category="${transaction.id}">
                          <option value="housing" ${transaction.category === "housing" ? "selected" : ""}>Housing</option>
                          <option value="essentials" ${transaction.category === "essentials" ? "selected" : ""}>Essentials</option>
                          <option value="debt" ${transaction.category === "debt" ? "selected" : ""}>Debt</option>
                          <option value="car" ${transaction.category === "car" ? "selected" : ""}>Car</option>
                          <option value="fun" ${transaction.category === "fun" ? "selected" : ""}>Fun</option>
                          <option value="other" ${transaction.category === "other" ? "selected" : ""}>Other</option>
                        </select>
                      </label>
                      <label>
                        Recurring
                        <select data-transaction-subscription="${transaction.id}">
                          <option value="auto" ${(!transaction.subscriptionStatus || transaction.subscriptionStatus === "auto") ? "selected" : ""}>Auto</option>
                          <option value="subscribed" ${transaction.subscriptionStatus === "subscribed" ? "selected" : ""}>Subscription</option>
                          <option value="ignored" ${transaction.subscriptionStatus === "ignored" ? "selected" : ""}>Not recurring</option>
                        </select>
                      </label>
                    </div>
                    <div class="transaction-actions-row">
                      <button type="button" class="ghost-btn" data-save-transaction="${transaction.id}">Save review</button>
                      <button type="button" class="ghost-btn" data-delete-transaction="${transaction.id}">Delete</button>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  container.querySelectorAll("[data-delete-transaction]").forEach((button) => {
    button.addEventListener("click", () => deleteTransaction(button.dataset.deleteTransaction));
  });
  container.querySelectorAll("[data-save-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.saveTransaction;
      const category = container.querySelector(`[data-transaction-category="${id}"]`)?.value || "other";
      const subscriptionStatus =
        container.querySelector(`[data-transaction-subscription="${id}"]`)?.value || "auto";
      updateTransactionReview(id, category, subscriptionStatus);
    });
  });

  updateTransactionSummary(filteredTransactions);
  renderTransactionMonthGroups(state.transactions);
  renderAutomationHub();
}

function renderSubscriptions() {
  const container = document.getElementById("subscription-list");
  if (!container) {
    return;
  }
  const total = state.subscriptions.reduce(
    (sum, item) => sum + Number(item.monthlyEstimate || 0),
    0
  );
  const biggestSubscription = state.subscriptions
    .slice()
    .sort((left, right) => Number(right.monthlyEstimate || right.amount || 0) - Number(left.monthlyEstimate || left.amount || 0))[0];

  document.getElementById("subscription-total").textContent = currency.format(total);
  document.getElementById("subscription-count").textContent = String(state.subscriptions.length);
  document.getElementById("subscription-biggest").textContent = biggestSubscription
    ? currency.format(biggestSubscription.monthlyEstimate || biggestSubscription.amount || 0)
    : "$0";
  document.getElementById("subscription-review-label").textContent = state.subscriptions.length
    ? "Ready to review"
    : "Needs data";
  document.getElementById("subscription-action-label").textContent = state.subscriptions.length
    ? "Trim the extras"
    : "Review list";
  document.getElementById("subscription-automation-label").textContent = state.subscriptions.length
    ? "Auto-detected"
    : "Needs linked data";
  document.getElementById("subscription-focus-label").textContent = biggestSubscription
    ? formatMerchantName(biggestSubscription.merchant)
    : "Trim extras";

  if (!state.subscriptions.length) {
    container.innerHTML = `
      <div class="linked-item empty-state">
        <strong>No likely subscriptions yet</strong>
        <p>Refresh connected data and Growr will start looking for recurring merchants automatically.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.subscriptions
    .map(
      (item) => `
        <article class="subscription-item">
          <div class="subscription-top">
            <div>
              <h3>${formatMerchantName(item.merchant)}</h3>
              <p>${item.nextReviewHint} · ${item.status === "confirmed" ? "confirmed by you" : "detected by Growr"}</p>
            </div>
            <strong>${currency.format(item.monthlyEstimate || item.amount || 0)}</strong>
          </div>
          <p class="subscription-meta">Latest charge ${currency.format(item.amount || 0)} · ${item.category} · ${item.transactionsCount} matching charges</p>
          <div class="subscription-actions">
            <button type="button" class="ghost-btn" data-subscription-review="${item.transactionIds[0]}" data-subscription-status="subscribed">Keep as subscription</button>
            <button type="button" class="ghost-btn" data-subscription-review="${item.transactionIds[0]}" data-subscription-status="ignored">Ignore</button>
          </div>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-subscription-review]").forEach((button) => {
    button.addEventListener("click", () => {
      updateTransactionReview(
        button.dataset.subscriptionReview,
        "",
        button.dataset.subscriptionStatus
      );
    });
  });
}

function renderBills() {
  const container = document.getElementById("bill-list");
  if (!container) {
    return;
  }
  const total = state.recurringBills.reduce(
    (sum, item) => sum + Number(item.monthlyEstimate || 0),
    0
  );

  document.getElementById("bill-total").textContent = currency.format(total);
  document.getElementById("bill-count").textContent = String(state.recurringBills.length);
  document.getElementById("bill-review-label").textContent = state.recurringBills.length
    ? "Auto-fill ready"
    : "Needs data";
  document.getElementById("bill-impact-label").textContent = state.recurringBills.length
    ? "Feeds planner"
    : "Waiting on data";

  if (!state.recurringBills.length) {
    container.innerHTML = `
      <div class="linked-item empty-state">
        <strong>No recurring bills found yet</strong>
        <p>Growr can separate likely bills from subscriptions after enough transaction history is available.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.recurringBills
    .map(
      (item) => `
        <article class="subscription-item">
          <div class="subscription-top">
            <div>
              <h3>${formatMerchantName(item.merchant)}</h3>
              <p>${item.nextReviewHint} · likely ${formatCategoryLabel(item.category)}</p>
            </div>
            <strong>${currency.format(item.monthlyEstimate || item.amount || 0)}</strong>
          </div>
          <p class="subscription-meta">Latest charge ${currency.format(item.amount || 0)} · ${item.transactionsCount} matching charges</p>
        </article>
      `
    )
    .join("");
}

function formatDaysUntil(days) {
  if (days === null || Number.isNaN(days)) {
    return "Needs pattern";
  }

  if (days <= 0) {
    return "Very soon";
  }

  if (days === 1) {
    return "In 1 day";
  }

  return `In ${days} days`;
}

function renderRecurringIncome() {
  const container = document.getElementById("paycheck-list");
  if (!container) {
    return;
  }
  const monthlyIncome = state.recurringIncome.reduce(
    (sum, item) => sum + Number(item.estimatedMonthlyIncome || 0),
    0
  );
  const nextIncome = state.recurringIncome
    .slice()
    .sort((left, right) => {
      const leftTime = left.nextExpectedDate ? new Date(left.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextExpectedDate ? new Date(right.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    })[0];

  const nextDaysUntil = nextIncome?.nextExpectedDate
    ? Math.round((new Date(nextIncome.nextExpectedDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  document.getElementById("paycheck-total").textContent = currency.format(monthlyIncome);
  document.getElementById("paycheck-count").textContent = String(state.recurringIncome.length);
  document.getElementById("paycheck-next").textContent = nextIncome
    ? `${formatMerchantName(nextIncome.merchant)} · ${formatDaysUntil(nextDaysUntil)}`
    : "Need linked deposits";
  document.getElementById("paycheck-rhythm-label").textContent = nextIncome
    ? formatDaysUntil(nextDaysUntil)
    : "Need linked deposits";
  document.getElementById("paycheck-use-label").textContent = state.recurringIncome.length
    ? "Supports auto-fill"
    : "Waiting on data";

  if (!state.recurringIncome.length) {
    container.innerHTML = `
      <div class="linked-item empty-state">
        <strong>No recurring paychecks found yet</strong>
        <p>Growr looks for payroll-style deposits and repeating income patterns after enough linked transaction history is available.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.recurringIncome
    .map((item) => {
      const daysUntil = item.nextExpectedDate
        ? Math.round((new Date(item.nextExpectedDate) - new Date()) / (1000 * 60 * 60 * 24))
        : null;
      return `
        <article class="subscription-item">
          <div class="subscription-top">
            <div>
              <h3>${formatMerchantName(item.merchant)}</h3>
              <p>${item.transactionsCount || 0} matching deposits · every ${Math.round(
                Number(item.averageIntervalDays || 14)
              )} days</p>
            </div>
            <strong>${currency.format(item.estimatedMonthlyIncome || item.averageAmount || 0)}</strong>
          </div>
          <p class="subscription-meta">Average deposit ${currency.format(
            item.averageAmount || 0
          )} · next likely ${item.nextExpectedDate ? new Date(item.nextExpectedDate).toLocaleDateString() : "unknown"} · ${formatDaysUntil(daysUntil)}</p>
        </article>
      `;
    })
    .join("");
}

function renderRecurringInsights() {
  const container = document.getElementById("recurring-insights");
  if (!container) {
    return;
  }

  const subscriptionTotal = state.subscriptions.reduce(
    (sum, item) => sum + Number(item.monthlyEstimate || 0),
    0
  );
  const insights = [];

  if (subscriptionTotal > 0) {
    insights.push({
    label: "Monthly subscription total",
      body:
        subscriptionTotal >= 100
          ? `${currency.format(subscriptionTotal)} per month is tied up in recurring subscriptions. That is worth reviewing for easy savings.`
          : `${currency.format(subscriptionTotal)} per month is tied up in recurring subscriptions.`,
    });
  }

  insights.push({
    label: "Automation still on",
    body: "Growr still uses recurring bills and paycheck patterns in the background to sharpen your budget, snapshot, and monthly recommendations.",
  });

  insights.push({
    label: "Real examples",
    body: "Recognizable merchants like Adobe, DoorDash, Netflix, Spotify, Apple, or Amazon can show up here once Growr has enough linked history to trust the pattern.",
  });

  if (!insights.length) {
    container.innerHTML = `
      <article class="automation-highlight-card recurring-insight-card">
        <span>Need linked history</span>
        <strong>Connect accounts to unlock the subscriptions view</strong>
      </article>
    `;
    return;
  }

  container.innerHTML = insights
    .slice(0, 3)
    .map(
      (item) => `
        <article class="automation-highlight-card recurring-insight-card">
          <span>${item.label}</span>
          <strong>${item.body}</strong>
        </article>
      `
    )
    .join("");
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
  state.linkedSummary = {
    cashTotal: summary.cashTotal || 0,
    creditCardDebt: summary.creditCardDebt || 0,
    loanDebt: summary.loanDebt || 0,
    investmentsTotal: summary.investmentsTotal || 0,
    preferences: summary.preferences || { nicknames: {}, hiddenAccountIds: [] },
    accounts: summary.accounts || [],
    liabilities: summary.liabilities || [],
    investments: summary.investments || [],
  };
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
          <div class="linked-item-row">
            ${renderIdentityBadge(account.name, "linked-avatar", getInstitutionProfile(account.institution, account.name))}
            <div class="linked-item-copy">
              <strong>${account.displayName || account.name}</strong>
              <p>${account.typeLabel}</p>
            </div>
            <strong class="linked-amount">${currency.format(account.currentBalance || 0)}</strong>
          </div>
          <div class="linked-item-actions">
            <label class="linked-nickname">
              <span>Nickname</span>
              <input type="text" value="${escapeHtml(account.nickname || "")}" data-linked-nickname="${account.accountId}" placeholder="Example: Bills checking" />
            </label>
            <div class="linked-action-buttons">
              <button type="button" class="ghost-btn" data-linked-save="${account.accountId}">Save nickname</button>
              <button type="button" class="ghost-btn warn-btn" data-linked-hide="${account.accountId}">Remove from Growr</button>
            </div>
          </div>
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
          <div class="linked-item-row">
            ${renderIdentityBadge(liability.name, "linked-avatar", getInstitutionProfile(liability.institution, liability.name))}
            <div class="linked-item-copy">
              <strong>${liability.name}</strong>
              <p>${liability.kind}</p>
            </div>
            <strong class="linked-amount">${currency.format(liability.amount || 0)}</strong>
          </div>
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
          <div class="linked-item-row">
            ${renderIdentityBadge(
              investment.displayName || investment.accountName,
              "linked-avatar",
              getInstitutionProfile(investment.institution, investment.displayName || investment.accountName)
            )}
            <div class="linked-item-copy">
              <strong>${investment.displayName || investment.accountName}</strong>
              <p>${investment.holdingsCount} holdings</p>
            </div>
            <strong class="linked-amount">${currency.format(investment.value || 0)}</strong>
          </div>
        </article>
      `
    ),
    "No investment accounts linked yet."
  );

  document.querySelectorAll("[data-linked-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const accountId = button.dataset.linkedSave;
      const nickname =
        document.querySelector(`[data-linked-nickname="${accountId}"]`)?.value.trim() || "";
      updateLinkedAccountPreferences(accountId, { nickname, hidden: false });
    });
  });

  document.querySelectorAll("[data-linked-hide]").forEach((button) => {
    button.addEventListener("click", () => {
      updateLinkedAccountPreferences(button.dataset.linkedHide, { hidden: true });
    });
  });
}

function updateLinkedAccountPreferences(accountId, { nickname = "", hidden = false } = {}) {
  if (!state.user) {
    setPlaidMessage("Sign in before organizing linked accounts.");
    return;
  }

  setPlaidMessage(hidden ? "Removing account from Growr..." : "Saving account preferences...");

  fetch("/api/plaid/account-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, nickname, hidden }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update linked account.");
      }

      setPlaidMessage(payload.message || "Linked account updated.");
      return loadLinkedSummary();
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function loadTransactions() {
  if (!state.user) {
    state.transactions = [];
    state.subscriptions = [];
    state.recurringBills = [];
    state.recurringIncome = [];
    renderTransactions();
    renderSubscriptions();
    renderBills();
    renderRecurringIncome();
    renderRecurringInsights();
    renderCategoryProgress();
    setTransactionStatus("Sign in to save and load transactions.");
    setSubscriptionStatus("Sign in to review your subscriptions.");
    setBillStatus("Sign in to review recurring bills.");
    setPaycheckStatus("Sign in to review recurring income.");
    return Promise.resolve();
  }

  setTransactionStatus("Loading transactions...");
  setSubscriptionStatus("Scanning for subscriptions...");
  setBillStatus("Scanning for recurring bills...");
  setPaycheckStatus("Scanning for recurring income...");
  return Promise.all([
    fetch("/api/transactions"),
    fetch("/api/transactions/subscriptions"),
  ])
    .then(async ([transactionsResponse, subscriptionsResponse]) => {
      const payload = await transactionsResponse.json();
      const subscriptionPayload = await subscriptionsResponse.json();
      if (!transactionsResponse.ok) {
        throw new Error(payload.error || "Unable to load transactions.");
      }
      if (!subscriptionsResponse.ok) {
        throw new Error(subscriptionPayload.error || "Unable to load subscriptions.");
      }

      state.transactions = payload.transactions || [];
      state.subscriptions = subscriptionPayload.subscriptions || [];
      state.recurringBills = subscriptionPayload.bills || [];
      state.recurringIncome = subscriptionPayload.recurringIncome || [];
      renderTransactions();
      renderSubscriptions();
      renderBills();
      renderRecurringIncome();
      renderRecurringInsights();
      renderCategoryProgress();
      updateDashboard();
      setTransactionStatus("Transactions loaded.");
      setSubscriptionStatus(
        state.subscriptions.length
          ? "Growr found likely subscriptions. Review anything that looks off."
          : "No recurring subscriptions found yet."
      );
      setBillStatus(
        state.recurringBills.length
          ? "Recurring bills are ready to help prefill your planner."
          : "No recurring bills found yet."
      );
      setPaycheckStatus(
        state.recurringIncome.length
          ? "Growr found repeating deposits that can help auto-fill your income."
          : "No recurring paychecks found yet."
      );
    })
    .catch((error) => {
      setTransactionStatus(error.message);
      setSubscriptionStatus(error.message);
      setBillStatus(error.message);
      setPaycheckStatus(error.message);
      updateDashboard();
    });
}

function syncConnectedWorkspace({ autoFill = false } = {}) {
  setPlaidMessage(autoFill
    ? "Connected. Pulling balances, transactions, and smart defaults..."
    : "Refreshing connected account data...");

  return loadLinkedSummary()
    .then(() => importPlaidTransactions({ silent: true }))
    .then(() => {
      if (!autoFill) {
        return null;
      }
      return fetch("/api/planner/autofill", { method: "POST" })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Unable to auto-fill planner.");
          }
          applyPlannerPayload(payload.planner || {});
          setPlannerStatus(payload.message || "Planner auto-filled from connected data.");
        })
        .catch(() => null);
    })
    .then(() => {
      setPlaidMessage(
        autoFill
          ? "Accounts connected. Growr refreshed balances, pulled transactions, and updated your workspace."
          : "Connected account data refreshed."
      );
    })
    .catch((error) => {
      setPlaidMessage(error.message);
    });
}

function autofillPlannerFromConnectedData() {
  if (!state.user) {
    setPlannerStatus("Sign in before auto-filling your planner.");
    return;
  }

  const hasConnectedSignals =
    Boolean(state.linkedSummary?.accounts?.length) ||
    Boolean(state.transactions.length) ||
    state.linkedSummary.cashTotal > 0 ||
    state.linkedSummary.creditCardDebt > 0 ||
    state.linkedSummary.loanDebt > 0;

  if (!hasConnectedSignals) {
    setPlannerStatus("Connect accounts or refresh connected data before using auto-fill.");
    updatePlannerActionState();
    return;
  }

  setPlannerStatus("Auto-filling from connected data...");
  fetch("/api/planner/autofill", {
    method: "POST",
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to auto-fill planner.");
      }

      applyPlannerPayload(payload.planner || {});
      updateDashboard();
      setPlannerStatus(payload.message || "Planner auto-filled. Review before saving.");
      updatePlannerActionState();
    })
    .catch((error) => {
      setPlannerStatus(error.message);
      updatePlannerActionState();
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

function updateTransactionReview(id, category, subscriptionStatus) {
  setTransactionStatus("Saving transaction review...");
  fetch("/api/transactions/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, category, subscriptionStatus }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update transaction.");
      }

      setTransactionStatus("Transaction review saved.");
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
    retirementAge: getValue("retirementAge"),
    retirementMonthlyGoal: getValue("retirementMonthlyGoal"),
    retirementIncomeOther: getValue("retirementIncomeOther"),
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

function submitAiQuestion(question) {
  const trimmedQuestion = String(question || "").trim();
  const input = document.getElementById("ai-question");
  const sendButton = document.getElementById("ai-send-button");
  const resetButton = document.getElementById("ai-reset-button");

  if (!trimmedQuestion) {
    setAiStatus("Type a question first.");
    return Promise.resolve();
  }

  if (!state.config?.openaiConfigured) {
    setAiStatus("Ask Growr is not connected yet. Add OPENAI_API_KEY to turn on AI answers.");
    return Promise.resolve();
  }

  state.ai.messages.push({ role: "user", text: trimmedQuestion });
  state.ai.isLoading = true;
  renderAiMessages();
  setAiStatus(state.user ? "Growr is typing with your saved plan in mind..." : "Growr is typing...");
  input.value = "";
  sendButton.disabled = true;
  resetButton.disabled = true;

  return fetch("/api/ai/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: trimmedQuestion,
      previousResponseId: state.ai.previousResponseId,
    }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to get an AI answer right now.");
      }

      state.ai.previousResponseId = payload.responseId || null;
      state.ai.isLoading = false;
      state.ai.messages.push({ role: "assistant", text: payload.answer });
      renderAiMessages();
      setAiStatus(
        payload.personalized
          ? "Answer ready. Growr used your saved plan for extra context."
          : "Answer ready."
      );
    })
    .catch((error) => {
      state.ai.isLoading = false;
      state.ai.messages.push({
        role: "assistant",
        text: error.message,
      });
      renderAiMessages();
      setAiStatus("Ask Growr hit a snag. Try a shorter question.");
    })
    .finally(() => {
      state.ai.isLoading = false;
      syncAiAvailability();
      renderAiMessages();
    });
}

function handleAiSubmit(event) {
  event.preventDefault();
  submitAiQuestion(document.getElementById("ai-question").value);
}

function handleAiInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitAiQuestion(event.currentTarget.value);
  }
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
      updatePlannerActionState();
    })
    .catch((error) => {
      setPlannerStatus(error.message);
      updatePlannerActionState();
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
  const cashflowInsights = document.getElementById("cashflow-insights");
  const expenseInsights = document.getElementById("expense-insights");
  const investmentInsights = document.getElementById("investment-insights");
  const networthInsights = document.getElementById("networth-trend-insights");
  const retirementInsights = document.getElementById("retirement-runway-insights");

  const incomeBase = Math.max(data.income, 1);
  const cashSegments = [
    { key: "housing", label: "Housing", amount: data.housing },
    { key: "essentials", label: "Essentials", amount: data.essentials },
    { key: "debt", label: "Debt", amount: data.creditCardPayment + data.otherDebt },
    { key: "car", label: "Car", amount: data.carPayment + data.carCosts },
    { key: "leftover", label: "Leftover", amount: Math.max(data.leftover, 0) },
  ];
  const cashChartScale = Math.max(
    data.income,
    data.totalExpenses,
    ...cashSegments.map((segment) => segment.amount),
    1
  );

  cashflowChart.innerHTML = cashSegments
    .map((segment) => {
      const height = Math.max(Math.min((segment.amount / cashChartScale) * 180, 180), 12);
      const shareOfIncome = data.income > 0 ? segment.amount / data.income : 0;
      const label = data.income > 0 && shareOfIncome <= 1.5
        ? percent.format(shareOfIncome)
        : currency.format(segment.amount);
      return `
        <div class="stack-column">
          <div class="stack-segment" style="height:${height}px;background:${chartPalette[segment.key]}">
            <strong>${label}</strong>
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
  expenseNote.textContent = `${largestExpense.label} is currently the biggest monthly cost.`;
  if (cashflowInsights) {
    cashflowInsights.innerHTML = `
      <span class="insight-chip">Fixed costs: ${currency.format(data.totalExpenses)}</span>
      <span class="insight-chip">Biggest cost: ${largestExpense.label}</span>
      <span class="insight-chip">Money left: ${currency.format(data.leftover)}</span>
    `;
  }
  if (expenseInsights) {
    const rankedExpenses = cashSegments
      .filter((segment) => segment.key !== "leftover")
      .sort((first, second) => second.amount - first.amount);
    const secondExpense = rankedExpenses[1] || rankedExpenses[0];
    expenseInsights.innerHTML = `
      <span class="insight-chip">Largest category: ${rankedExpenses[0].label}</span>
      <span class="insight-chip">Second largest: ${secondExpense.label}</span>
    `;
  }
  investNote.textContent = hasInvestmentAccess()
    ? `Projected total after ${data.years} years: ${currency.format(data.totalFuture)}.`
    : "Investment forecasting is available on the Bundle plan.";
  if (investmentInsights) {
    const biggestInvestment = investmentRows.slice().sort((a, b) => b.amount - a.amount)[0];
    investmentInsights.innerHTML = hasInvestmentAccess()
      ? `
        <span class="insight-chip">Largest account: ${biggestInvestment.label}</span>
        <span class="insight-chip">10-year total: ${currency.format(data.totalFuture)}</span>
      `
      : `
        <span class="insight-chip">Largest account: Locked</span>
        <span class="insight-chip">10-year total: Locked</span>
      `;
  }

  renderProjectionLineChart({
    chartId: "networth-trend-chart",
    labelId: "networth-trend-label",
    noteId: "networth-trend-note",
    series: data.netWorthSeries,
    lineColor: "#3867ff",
    fillColor: "#8cb0ff",
    noteText:
      data.netWorthSeries.length > 1
        ? `Estimated net worth grows from ${currency.format(data.netWorthSeries[0].value)} to ${currency.format(data.netWorthSeries[data.netWorthSeries.length - 1].value)} across the projection path.`
        : "Growr will project net worth once it has enough inputs.",
  });
  if (networthInsights) {
    networthInsights.innerHTML = `
      <span class="insight-chip">Starting point: ${currency.format(data.netWorthSeries[0]?.value || 0)}</span>
      <span class="insight-chip">Projected path: ${currency.format(data.netWorthSeries[data.netWorthSeries.length - 1]?.value || 0)}</span>
    `;
  }

  if (hasInvestmentAccess()) {
    renderProjectionLineChart({
      chartId: "retirement-runway-chart",
      labelId: "retirement-runway-label",
      noteId: "retirement-runway-note",
      series: data.retirementSeries,
      lineColor: "#00b894",
      fillColor: "#8af0d7",
      noteText:
        data.retirementGap > 0
          ? `Current pace may still leave about ${currency.format(data.retirementGap)} per month uncovered at retirement.`
          : "Current saving pace is covering the retirement income target you entered.",
    });
    if (retirementInsights) {
      retirementInsights.innerHTML = `
        <span class="insight-chip">Monthly goal: ${currency.format(data.retirementMonthlyGoal || 0)}</span>
        <span class="insight-chip">Estimated support: ${currency.format(data.retirementMonthlySupport || 0)}</span>
        <span class="insight-chip">Gap: ${currency.format(Math.max(data.retirementGap || 0, 0))}</span>
      `;
    }
    return;
  }

  document.getElementById("retirement-runway-chart").innerHTML = "";
  document.getElementById("retirement-runway-label").textContent = "Locked";
  document.getElementById("retirement-runway-note").textContent =
    "Upgrade to Bundle to compare your projected retirement path against the amount your monthly retirement income goal may need.";
  if (retirementInsights) {
    retirementInsights.innerHTML = `
      <span class="insight-chip">Monthly goal: Locked</span>
      <span class="insight-chip">Estimated support: Locked</span>
      <span class="insight-chip">Gap: Locked</span>
    `;
  }
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
  const scoreColor = score >= 75 ? "#00b894" : score >= 50 ? "#ffd33d" : "#ff5a36";

  healthScore.textContent = String(score);
  orb.style.setProperty("--score-angle", `${score * 3.6}deg`);
  orb.style.setProperty("--score-color", scoreColor);

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
  const scoreInsights = document.getElementById("score-insights");
  if (scoreInsights) {
    scoreInsights.innerHTML = `
      <span class="insight-chip">Money left this month: ${currency.format(snapshot.leftover)}</span>
      <span class="insight-chip">Debt load: ${snapshot.debtRatio > 0.35 ? "High" : snapshot.debtRatio > 0.2 ? "Moderate" : "Balanced"}</span>
      <span class="insight-chip">Emergency savings: ${snapshot.emergencyMonths >= 3 ? "Strong" : snapshot.emergencyMonths >= 1 ? "Building" : "Needs work"}</span>
    `;
  }

  signalSavings.textContent =
    snapshot.emergencyMonths >= 3 ? "Strong" : snapshot.emergencyMonths >= 1 ? "Building" : "Needs work";
  signalDebt.textContent =
    snapshot.debtRatio > 0.35 ? "High" : snapshot.debtRatio > 0.2 ? "Moderate" : "Balanced";
  signalInvesting.textContent =
    snapshot.leftover > 500 && snapshot.creditCardBalance === 0 ? "Room to grow" : "Cautious";
}

function renderSnapshotCommandCenter(summary) {
  const badge = document.getElementById("snapshot-badge");
  const headline = document.getElementById("snapshot-headline");
  const summaryCopy = document.getElementById("snapshot-summary-copy");
  const nextTitle = document.getElementById("snapshot-next-title");
  const nextBody = document.getElementById("snapshot-next-body");
  const secondTitle = document.getElementById("snapshot-second-title");
  const secondBody = document.getElementById("snapshot-second-body");
  const thirdTitle = document.getElementById("snapshot-third-title");
  const thirdBody = document.getElementById("snapshot-third-body");

  document.getElementById("snapshot-leftover").textContent = currency.format(summary.leftover);
  document.getElementById("snapshot-burn").textContent = currency.format(summary.totalExpenses);
  document.getElementById("snapshot-runway").textContent =
    summary.totalExpenses > 0
      ? `${(summary.cashAssets / summary.totalExpenses).toFixed(1)} months`
      : "0 months";
  document.getElementById("snapshot-retirement-pace").textContent = summary.hasInvestmentAccess
    ? summary.retirementGap > 0
      ? `${currency.format(summary.retirementGap)} short`
      : "On track"
    : "Locked";

  if (summary.leftover < 0) {
    badge.textContent = "Pressure";
    badge.className = "command-badge danger";
    headline.textContent = "Your monthly plan is running short right now.";
    summaryCopy.textContent = `Growr estimates you're about ${currency.format(Math.abs(summary.leftover))} short each month after core bills and debt payments.`;
    nextTitle.textContent = "Cut cash leakage first";
    nextBody.textContent = "Trim flexible spending and pause optional investing until the monthly plan gets back above zero.";
    secondTitle.textContent = "Attack high-interest debt";
    secondBody.textContent = "Credit card balances will keep making the month tighter until they stop eating your margin.";
  } else if (summary.debtRatio > 0.3) {
    badge.textContent = "Tight";
    badge.className = "command-badge warn";
    headline.textContent = "You still have money left, but debt is eating flexibility.";
    summaryCopy.textContent = `You have ${currency.format(summary.leftover)} left each month, but debt is still high enough to slow everything else down.`;
    nextTitle.textContent = "Use your extra money on purpose";
    nextBody.textContent = "Put part of the money left this month toward your most expensive debt before raising lifestyle spending.";
    secondTitle.textContent = "Watch the car and debt stack";
    secondBody.textContent = "Those two categories together are probably the biggest reason the month still feels heavy.";
  } else {
    badge.textContent = "Stable";
    badge.className = "command-badge good";
    headline.textContent = "You still have room to work with this month.";
    summaryCopy.textContent = `Growr estimates ${currency.format(summary.leftover)} left after your core monthly plan, which gives you room to save, invest, or speed up debt payoff.`;
    nextTitle.textContent = "Protect the money you still have left";
    nextBody.textContent = "Keep fixed costs from creeping up so this extra room does not quietly disappear.";
    secondTitle.textContent = "Make progress automatically";
    secondBody.textContent = "Use some of the extra room each month for emergency savings, retirement contributions, or faster debt payoff.";
  }

  thirdTitle.textContent = summary.hasInvestmentAccess
    ? "Check whether retirement still looks on track"
    : "Unlock retirement planning";
  thirdBody.textContent = summary.hasInvestmentAccess
    ? summary.retirementGap > 0
      ? `At your current pace, retirement may still be about ${currency.format(summary.retirementGap)} per month short of your target.`
      : "Your current saving pace is covering the monthly retirement income target you entered."
    : "Upgrade to compare your retirement income goal with what your current accounts may actually support.";
}

function renderSnapshotFeed(summary) {
  const changeTitle = document.getElementById("snapshot-change-title");
  const changeBody = document.getElementById("snapshot-change-body");
  const spendPace = document.getElementById("snapshot-spend-pace");
  const recurringDrag = document.getElementById("snapshot-recurring-drag");
  const nextPayday = document.getElementById("snapshot-next-payday");
  const topCategory = document.getElementById("snapshot-top-category");
  const feedList = document.getElementById("snapshot-feed-list");
  const automation = buildMonthlyAutomationData();
  const latestMonth = automation.monthlySeries[automation.monthlySeries.length - 1];
  const priorMonth = automation.monthlySeries[automation.monthlySeries.length - 2];
  const topCategoryEntry = Object.entries(automation.currentCategorySpend).sort((left, right) => right[1] - left[1])[0];
  const biggestRecurring = [...state.subscriptions, ...state.recurringBills].sort(
    (left, right) => Number(right.monthlyEstimate || right.amount || 0) - Number(left.monthlyEstimate || left.amount || 0)
  )[0];
  const nextBill = state.recurringBills[0];
  const linkedCount = state.linkedSummary?.accounts?.length || 0;
  const nextIncome = state.recurringIncome
    .slice()
    .sort((left, right) => {
      const leftTime = left.nextExpectedDate ? new Date(left.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextExpectedDate ? new Date(right.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    })[0];
  const nextIncomeDays = nextIncome?.nextExpectedDate
    ? Math.round((new Date(nextIncome.nextExpectedDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  recurringDrag.textContent = currency.format(automation.recurringTotal || 0);
  nextPayday.textContent = nextIncome
    ? `${formatMerchantName(nextIncome.merchant)} · ${formatDaysUntil(nextIncomeDays)}`
    : "Need deposits";
  topCategory.textContent = topCategoryEntry
    ? `${formatCategoryLabel(topCategoryEntry[0])} · ${currency.format(topCategoryEntry[1])}`
    : "Waiting on data";

  if (latestMonth && priorMonth) {
    const spendDifference = latestMonth.spend - priorMonth.spend;
    const spendDirection = spendDifference > 0 ? "up" : spendDifference < 0 ? "down" : "flat";
    spendPace.textContent =
      spendDirection === "flat"
        ? "Flat vs last month"
        : `${currency.format(Math.abs(spendDifference))} ${spendDirection}`;
    changeTitle.textContent =
      spendDifference > 0
        ? "Spending picked up compared with last month."
        : spendDifference < 0
          ? "Spending cooled down compared with last month."
          : "This month is tracking close to last month.";
    changeBody.textContent =
      spendDifference > 0
        ? `Growr sees ${currency.format(Math.abs(spendDifference))} more spending than last month so far, so this is a good time to check repeating charges and category spikes.`
        : spendDifference < 0
          ? `You are running about ${currency.format(Math.abs(spendDifference))} below last month so far, which gives you a little more room to redirect money intentionally.`
          : "The month looks steady so far. Use the live feed below to review recurring items, due-soon charges, and the next likely paycheck.";
  } else {
    spendPace.textContent = "Need history";
    changeTitle.textContent = "Growr is watching what changed.";
    changeBody.textContent =
      "Connect accounts or add transactions to turn Snapshot into a running monthly story, not just a static set of totals.";
  }

  const feedItems = [];

  if (linkedCount > 0) {
    feedItems.push({
      label: "Automatic tracking",
      title: `Growr is tracking ${linkedCount} linked account${linkedCount === 1 ? "" : "s"}`,
      body:
        automation.recurringTotal > 0
          ? `Recurring bills and subscriptions already total about ${currency.format(automation.recurringTotal)} per month.`
          : "Balances are connected. More transaction history will unlock better recurring detection and sharper guidance.",
      tone: "good",
    });
  }

  if (topCategoryEntry) {
    feedItems.push({
      label: "Biggest cost right now",
      title: `${formatCategoryLabel(topCategoryEntry[0])} is leading the month`,
      body: `${currency.format(topCategoryEntry[1])} has gone to ${formatCategoryLabel(topCategoryEntry[0]).toLowerCase()} so far.`,
      tone: topCategoryEntry[1] > Math.max(summary.leftover, 0) ? "warn" : "",
    });
  }

  if (biggestRecurring) {
    feedItems.push({
      label: "Monthly subscriptions + bills",
      title: `${formatMerchantName(biggestRecurring.merchant)} is one of the heaviest repeating charges`,
      body: `${currency.format(biggestRecurring.monthlyEstimate || biggestRecurring.amount || 0)} per month is currently being treated as recurring.`,
      tone: Number(biggestRecurring.monthlyEstimate || biggestRecurring.amount || 0) >= 100 ? "warn" : "",
    });
  }

  if (nextBill) {
    feedItems.push({
      label: "Due next",
      title: `${formatMerchantName(nextBill.merchant)} looks like a recurring bill`,
      body: nextBill.nextReviewHint
        ? `${nextBill.nextReviewHint}. Growr is using it as an essential recurring payment.`
        : "Growr marked it as a recurring essential payment.",
      tone: "soft",
    });
  }

  if (nextIncome) {
    feedItems.push({
      label: "Next paycheck",
      title: `${formatMerchantName(nextIncome.merchant)} looks like your next recurring deposit`,
      body: nextIncome.nextExpectedDate
        ? `Likely around ${new Date(nextIncome.nextExpectedDate).toLocaleDateString()}. Growr can use this to auto-fill your income baseline.`
        : nextIncome.nextReviewHint || "Growr sees a repeating paycheck pattern here.",
      tone: "good",
    });
  }

  if (summary.leftover < 0) {
    feedItems.unshift({
      label: "Urgent",
      title: "This month is currently running short",
      body: `${currency.format(Math.abs(summary.leftover))} short after core monthly costs means cutting repeating charges and checking the biggest spending category first will matter most.`,
      tone: "danger",
    });
  } else if (summary.leftover > 0 && automation.recurringTotal > 0) {
    feedItems.push({
      label: "What to do first",
      title: "Protect the money you still have left",
      body: `You still have ${currency.format(summary.leftover)} left, but repeating charges are already taking ${currency.format(automation.recurringTotal)} per month. That is the cleanest place to review first.`,
      tone: "good",
    });
  }

  if (!feedItems.length) {
    feedList.innerHTML = `
      <article class="feed-item">
        <span class="feed-kicker">Start here</span>
        <strong>Add transactions or connect accounts</strong>
        <p>Once Growr has a little history, Snapshot will explain what changed, what repeats, what is due next, and what deserves attention first.</p>
      </article>
    `;
    return;
  }

  feedList.innerHTML = feedItems
    .slice(0, 4)
    .map(
      (item) => `
        <article class="feed-item ${item.tone ? `is-${item.tone}` : ""}">
          <span class="feed-kicker">${item.label}</span>
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </article>
      `
    )
    .join("");
}

function renderSnapshotMiniTrend(series) {
  const chart = document.getElementById("snapshot-mini-trend");
  if (!chart) {
    return;
  }

  const usableSeries = (series || []).filter((point) => Number(point.spend || 0) > 0).slice(-6);
  if (!usableSeries.length) {
    chart.innerHTML = "";
    return;
  }

  const width = 420;
  const height = 180;
  const paddingX = 18;
  const paddingTop = 18;
  const paddingBottom = 16;
  const maxValue = Math.max(...usableSeries.map((point) => Number(point.spend || 0)), 1);
  const stepX = usableSeries.length > 1 ? (width - paddingX * 2) / (usableSeries.length - 1) : 0;
  const points = usableSeries.map((point, index) => {
    const x = paddingX + stepX * index;
    const y =
      height -
      paddingBottom -
      (Number(point.spend || 0) / maxValue) * (height - paddingTop - paddingBottom);
    return { x, y };
  });

  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
  const lastPoint = points[points.length - 1];

  chart.innerHTML = `
    <defs>
      <linearGradient id="snapshot-mini-fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#7d8fff" stop-opacity="0.24"></stop>
        <stop offset="100%" stop-color="#7d8fff" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#snapshot-mini-fill)"></path>
    <path d="${linePath}" fill="none" stroke="#6e86ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
    <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="10" fill="#ffffff" stroke="#6e86ff" stroke-width="6"></circle>
  `;
}

function renderSnapshotDashboard(summary, automation) {
  const accounts = state.linkedSummary.accounts || [];
  const accountMatcher = (patterns) =>
    accounts.reduce((sum, account) => {
      const haystack = `${account.typeLabel || ""} ${account.displayName || ""} ${account.name || ""}`.toLowerCase();
      return patterns.some((pattern) => haystack.includes(pattern))
        ? sum + Number(account.currentBalance || 0)
        : sum;
    }, 0);
  const checkingBalance = accountMatcher(["checking"]);
  const savingsBalance = accountMatcher(["savings"]);
  const cardBalance = Number(state.linkedSummary.creditCardDebt || 0);
  const netCash = Number(state.linkedSummary.cashTotal || summary.cashAssets || 0) - cardBalance;
  const investmentsBalance = hasInvestmentAccess()
    ? Math.max(Number(state.linkedSummary.investmentsTotal || 0), Number(summary.currentInvestmentAssets || 0))
    : 0;
  const linkedCount = accounts.length;
  const latestMonth = automation.monthlySeries[automation.monthlySeries.length - 1];
  const priorMonth = automation.monthlySeries[automation.monthlySeries.length - 2];
  const spendDifference =
    latestMonth && priorMonth ? Number(latestMonth.spend || 0) - Number(priorMonth.spend || 0) : null;
  const nextIncome = state.recurringIncome
    .slice()
    .sort((left, right) => {
      const leftTime = left.nextExpectedDate ? new Date(left.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextExpectedDate ? new Date(right.nextExpectedDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    })[0];
  const nextIncomeDays = nextIncome?.nextExpectedDate
    ? Math.max(
        Math.round((new Date(nextIncome.nextExpectedDate) - new Date()) / (1000 * 60 * 60 * 24)),
        0
      )
    : null;

  document.getElementById("snapshot-current-spend").textContent = currency.format(automation.currentMonthSpend || 0);
  document.getElementById("snapshot-vs-last-icon").textContent =
    spendDifference === null ? "-" : spendDifference < 0 ? "OK" : spendDifference > 0 ? "UP" : "EV";
  document.getElementById("snapshot-vs-last").textContent =
    spendDifference === null
      ? "Need more monthly history"
      : spendDifference < 0
        ? `${currency.format(Math.abs(spendDifference))} below last month`
        : spendDifference > 0
          ? `${currency.format(spendDifference)} above last month`
          : "Tracking with last month";
  document.getElementById("snapshot-payday-card").textContent = nextIncome
    ? nextIncomeDays === 0
      ? "Payday is due now"
      : `Payday in ${nextIncomeDays} day${nextIncomeDays === 1 ? "" : "s"}`
    : "Need linked deposits";

  document.getElementById("snapshot-priority-label").textContent = linkedCount
    ? summary.leftover < 0
      ? "This month needs attention first"
      : "Your connected accounts are ready"
    : "Connect accounts to unlock automatic tracking";
  document.getElementById("snapshot-priority-meta").textContent = linkedCount
    ? summary.leftover < 0
      ? "Review spending"
      : "Refresh data"
    : "Add account";

  document.getElementById("snapshot-checking-balance").textContent = currency.format(checkingBalance);
  document.getElementById("snapshot-card-balance").textContent = currency.format(cardBalance);
  document.getElementById("snapshot-net-cash").textContent = currency.format(netCash);
  document.getElementById("snapshot-savings-balance").textContent = currency.format(savingsBalance);
  document.getElementById("snapshot-investments-balance").textContent = hasInvestmentAccess()
    ? currency.format(investmentsBalance)
    : "Locked";
  document.getElementById("snapshot-net-worth-card").textContent = currency.format(summary.netWorth || 0);
  document.getElementById("snapshot-sync-status").textContent = linkedCount
    ? `Showing ${linkedCount} connected account${linkedCount === 1 ? "" : "s"}.`
    : "Connect accounts to see balances here.";

  renderSnapshotMiniTrend(automation.monthlySeries);
}

function renderHouseholdOverview(summary) {
  const recurringTotal =
    state.subscriptions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0) +
    state.recurringBills.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0);
  const cashTotal = state.linkedSummary.cashTotal || summary.cashAssets || 0;
  const investingTotal = hasInvestmentAccess()
    ? Math.max(state.linkedSummary.investmentsTotal || 0, summary.currentInvestmentAssets || 0)
    : 0;

  document.getElementById("snapshot-household-cash").textContent = currency.format(cashTotal);
  document.getElementById("snapshot-household-networth").textContent = currency.format(summary.netWorth || 0);
  document.getElementById("snapshot-household-recurring").textContent = currency.format(recurringTotal);
  document.getElementById("snapshot-household-investing").textContent = hasInvestmentAccess()
    ? currency.format(investingTotal)
    : "Locked";
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
  const retirementYears = Math.max(investmentInputs.retirementAge - investmentInputs.age, 0);
  const retirementMonthlyGoal = investmentInputs.retirementMonthlyGoal;
  const retirementIncomeOther = investmentInputs.retirementIncomeOther;

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
  const retirementK401Future = futureValue(
    investmentInputs.k401Balance,
    investmentInputs.k401Contribution,
    returns.k401,
    retirementYears
  );
  const retirementRothFuture = futureValue(
    investmentInputs.rothBalance,
    investmentInputs.rothContribution,
    returns.roth,
    retirementYears
  );
  const retirementTraditionalIraFuture = futureValue(
    investmentInputs.traditionalIraBalance,
    investmentInputs.traditionalIraContribution,
    returns.traditionalIra,
    retirementYears
  );
  const retirementHsaFuture = futureValue(
    investmentInputs.hsaBalance,
    investmentInputs.hsaContribution,
    returns.hsa,
    retirementYears
  );
  const retirementCollege529Future = futureValue(
    investmentInputs.college529Balance,
    investmentInputs.college529Contribution,
    returns.college529,
    retirementYears
  );
  const retirementBrokerageFuture = futureValue(
    investmentInputs.brokerageBalance,
    investmentInputs.brokerageContribution,
    returns.brokerage,
    retirementYears
  );
  const totalFuture = hasInvestmentAccess()
    ? k401Future + rothFuture + traditionalIraFuture + hsaFuture + college529Future + brokerageFuture
    : 0;
  const retirementProjectedPortfolio = hasInvestmentAccess()
    ? retirementK401Future +
      retirementRothFuture +
      retirementTraditionalIraFuture +
      retirementHsaFuture +
      retirementCollege529Future +
      retirementBrokerageFuture
    : 0;
  const retirementMonthlyNeedFromPortfolio = Math.max(
    retirementMonthlyGoal - retirementIncomeOther,
    0
  );
  const retirementNestEgg = retirementMonthlyNeedFromPortfolio * 12 * 25;
  const retirementPortfolioIncome = hasInvestmentAccess()
    ? (retirementProjectedPortfolio * 0.04) / 12
    : 0;
  const retirementTotalIncome = hasInvestmentAccess()
    ? retirementPortfolioIncome + retirementIncomeOther
    : 0;
  const retirementGap = hasInvestmentAccess()
    ? retirementMonthlyGoal - retirementTotalIncome
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
  const projectionMarks = Array.from(new Set([0, 2, 5, years].filter((value) => value <= years))).sort(
    (left, right) => left - right
  );
  const netWorthSeries = projectionMarks.map((mark) => {
    const projectedInvestments = hasInvestmentAccess()
      ? futureValue(investmentInputs.k401Balance, investmentInputs.k401Contribution, returns.k401, mark) +
        futureValue(investmentInputs.rothBalance, investmentInputs.rothContribution, returns.roth, mark) +
        futureValue(
          investmentInputs.traditionalIraBalance,
          investmentInputs.traditionalIraContribution,
          returns.traditionalIra,
          mark
        ) +
        futureValue(investmentInputs.hsaBalance, investmentInputs.hsaContribution, returns.hsa, mark) +
        futureValue(
          investmentInputs.college529Balance,
          investmentInputs.college529Contribution,
          returns.college529,
          mark
        ) +
        futureValue(
          investmentInputs.brokerageBalance,
          investmentInputs.brokerageContribution,
          returns.brokerage,
          mark
        )
      : 0;
    const projectedEmergency = emergencyFund + Math.max(leftover, 0) * 12 * mark * 0.28;
    const projectedDebtDrop = Math.min(
      creditCardBalance + otherDebt,
      (creditCardPayment + otherDebt) * 12 * mark * 0.4
    );
    return {
      label: mark === 0 ? "Now" : `${mark}Y`,
      value: Math.max(
        0,
        homeEquity + carEquity + otherAssets + projectedEmergency + projectedInvestments -
          otherLiabilities - Math.max(creditCardBalance + otherDebt - projectedDebtDrop, 0)
      ),
    };
  });
  const retirementMarks = Array.from(
    new Set([0, Math.max(Math.round(retirementYears / 3), 1), Math.max(Math.round((retirementYears * 2) / 3), 1), retirementYears])
  )
    .filter((value) => value <= retirementYears)
    .sort((left, right) => left - right);
  const retirementSeries = retirementMarks.map((mark) => {
    const portfolioAtMark = hasInvestmentAccess()
      ? futureValue(investmentInputs.k401Balance, investmentInputs.k401Contribution, returns.k401, mark) +
        futureValue(investmentInputs.rothBalance, investmentInputs.rothContribution, returns.roth, mark) +
        futureValue(
          investmentInputs.traditionalIraBalance,
          investmentInputs.traditionalIraContribution,
          returns.traditionalIra,
          mark
        ) +
        futureValue(investmentInputs.hsaBalance, investmentInputs.hsaContribution, returns.hsa, mark) +
        futureValue(
          investmentInputs.college529Balance,
          investmentInputs.college529Contribution,
          returns.college529,
          mark
        ) +
        futureValue(
          investmentInputs.brokerageBalance,
          investmentInputs.brokerageContribution,
          returns.brokerage,
          mark
        )
      : 0;
    return {
      label: mark === 0 ? "Now" : `${mark}Y`,
      value: portfolioAtMark,
    };
  });

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
  document.getElementById("retirementAgeDisplay").textContent = hasInvestmentAccess()
    ? `${investmentInputs.retirementAge}`
    : "Locked";
  document.getElementById("retirementYearsLeft").textContent = hasInvestmentAccess()
    ? `${retirementYears.toFixed(0)}`
    : "Locked";
  document.getElementById("retirementMonthlyNeed").textContent = hasInvestmentAccess()
    ? currency.format(retirementMonthlyGoal)
    : "Locked";
  document.getElementById("retirementNestEgg").textContent = hasInvestmentAccess()
    ? currency.format(retirementNestEgg)
    : "Locked";
  document.getElementById("retirementProjectedPortfolio").textContent = hasInvestmentAccess()
    ? currency.format(retirementProjectedPortfolio)
    : "Locked";
  document.getElementById("retirementPortfolioIncome").textContent = hasInvestmentAccess()
    ? currency.format(retirementPortfolioIncome)
    : "Locked";
  document.getElementById("retirementTotalIncome").textContent = hasInvestmentAccess()
    ? currency.format(retirementTotalIncome)
    : "Locked";
  document.getElementById("retirementGap").textContent = hasInvestmentAccess()
    ? (retirementGap > 0 ? currency.format(retirementGap) : "On track")
    : "Locked";
  document.getElementById("retirementNote").textContent = hasInvestmentAccess()
    ? retirementGap > 0
      ? `You may still be about ${currency.format(retirementGap)} per month short of your target. Uses a simple 4% withdrawal rule for an educational estimate.`
      : `At this pace, your projected retirement income covers your target with about ${currency.format(Math.abs(retirementGap))} per month of cushion. Uses a simple 4% withdrawal rule for an educational estimate.`
    : "Upgrade to compare your retirement target against what your portfolio may actually support each month.";
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
  renderSnapshotCommandCenter({
    leftover,
    totalExpenses,
    debtRatio,
    cashAssets,
    retirementGap,
    hasInvestmentAccess: hasInvestmentAccess(),
  });
  renderSnapshotDashboard(
    {
      leftover,
      cashAssets,
      currentInvestmentAssets,
      netWorth,
    },
    buildMonthlyAutomationData()
  );
  renderHouseholdOverview({
    cashAssets,
    currentInvestmentAssets,
    netWorth,
  });
  renderAiCoachHighlights({
    debtRatio,
    leftover,
    recurringTotal:
      state.subscriptions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0) +
      state.recurringBills.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0),
    retirementGap: hasInvestmentAccess() ? retirementGap : null,
    hasInvestmentAccess: hasInvestmentAccess(),
  });
  renderSnapshotFeed({
    leftover,
  });
  renderCouplesExperience({
    householdCash: cashAssets + Number(state.linkedSummary.cashTotal || 0),
    householdNetWorth: netWorth,
    recurringLoad:
      state.subscriptions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0) +
      state.recurringBills.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0),
    householdInvesting: currentInvestmentAssets + Number(state.linkedSummary.investmentsTotal || 0),
    nextMove:
      leftover < 0
    ? "Trim repeating charges"
        : debtRatio > 0.28
          ? "Review debt together"
          : emergencyMonths < 2
            ? "Rebuild cushion"
    : "Put the money left this month to work",
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
    netWorthSeries,
    retirementSeries,
    retirementGap,
  });
}

function handleSignup(event) {
  event.preventDefault();
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const plan =
    document.querySelector('input[name="plan"]:checked')?.value || "budget";
  const couplesAddOn = plan === "couples" || plan === "bundle";
  const button = document.getElementById("signup-button");

  button.disabled = true;
  setAuthMessage("Starting your free trial...");

  fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, email, password, plan, couplesAddOn }),
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
      resetAiCoach();
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
      resetAiCoach();
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
      renderSubscriptions();
      renderBills();
      renderRecurringIncome();
      renderRecurringInsights();
      renderLinkedSummary({
        cashTotal: 0,
        creditCardDebt: 0,
        loanDebt: 0,
        investmentsTotal: 0,
        accounts: [],
        liabilities: [],
        investments: [],
      });
      setAuthMessage("");
      setPlaidMessage("Sign in before linking or loading account data.");
      applyFeatureGate();
      resetAiCoach();
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

  if (!state.config?.stripeApiConfigured) {
    setAccountStatus("Billing is not live yet, so payment updates and cancellation are still unavailable here.");
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

function handleAccountPlanChange() {
  if (!state.user) {
    setAccountStatus("Sign in before changing your subscription.");
    return;
  }

  const selectedPlan =
    document.querySelector('input[name="accountPlan"]:checked')?.value || getCurrentPlanKey();
  const selectedBillingInterval =
    document.querySelector('input[name="accountBillingInterval"]:checked')?.value || state.user.billingInterval || "monthly";
  const currentPlan = getCurrentPlanKey();
  const currentBillingInterval = state.user.billingInterval || "monthly";
  const button = document.getElementById("account-change-plan-button");
  const planStatus = document.getElementById("account-plan-status");

  if (selectedPlan === currentPlan && selectedBillingInterval === currentBillingInterval) {
    planStatus.textContent = "That subscription and billing cadence are already active.";
    refreshAccountPlanPreview();
    return;
  }

  button.disabled = true;
  planStatus.textContent = "Updating subscription...";

  fetch("/api/account/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: selectedPlan, billingInterval: selectedBillingInterval }),
  })
    .then(async (response) => {
      const payload = await readJsonResponse(
        response,
        "Growr could not update the subscription right now. Refresh the page and try again."
      );
      if (!response.ok) {
        throw new Error(payload.error || "Unable to change subscription.");
      }

      state.user = payload.account;
      renderAccountState();
      updateDashboard();
      setAccountStatus(payload.message);
      planStatus.textContent = payload.message;
      if (payload.checkoutUrl) {
        window.open(payload.checkoutUrl, "_blank", "noopener");
      }
    })
    .catch((error) => {
      renderAccountState();
      setAccountStatus(error.message);
      planStatus.textContent = `${error.message} Your saved subscription was not changed.`;
    })
    .finally(() => {
      refreshAccountPlanPreview();
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

function handleSendVerification() {
  if (!state.user) {
    setVerificationStatus("Sign in before requesting verification.");
    return;
  }

  const button = document.getElementById("account-resend-verification-button");
  button.disabled = true;
  setVerificationStatus("Sending verification code...");

  fetch("/api/account/send-verification", { method: "POST" })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to send verification.");
      }

      state.user = payload.account;
      renderAccountState();
      setAuthMessage(payload.message);
      setVerificationStatus(
        payload.debugCode
          ? `Verification code refreshed. Dev code: ${payload.debugCode}`
          : payload.message
      );
    })
    .catch((error) => {
      setVerificationStatus(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function handleVerifyEmail() {
  if (!state.user) {
    setVerificationStatus("Sign in before verifying your email.");
    return;
  }

  const code = document.getElementById("accountVerificationCode").value.trim();
  const button = document.getElementById("account-verify-button");
  button.disabled = true;
  setVerificationStatus("Verifying email...");

  fetch("/api/account/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to verify email.");
      }

      state.user = payload.account;
      document.getElementById("accountVerificationCode").value = "";
      renderAccountState();
      setAuthMessage(payload.message);
      setVerificationStatus(payload.message);
    })
    .catch((error) => {
      setVerificationStatus(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function handleRequestPasswordReset() {
  const email = document.getElementById("resetEmail").value.trim();
  const button = document.getElementById("request-reset-button");

  button.disabled = true;
  setAuthMessage("Preparing password reset...");

  fetch("/api/account/request-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to start password reset.");
      }

      setAuthMessage(
        payload.debugCode
          ? `${payload.message} Dev code: ${payload.debugCode}`
          : payload.message
      );
    })
    .catch((error) => {
      setAuthMessage(error.message);
    })
    .finally(() => {
      button.disabled = false;
    });
}

function handleResetPassword(event) {
  event.preventDefault();
  const email = document.getElementById("resetEmail").value.trim();
  const code = document.getElementById("resetCode").value.trim();
  const password = document.getElementById("resetPassword").value.trim();
  const button = document.getElementById("reset-password-button");

  button.disabled = true;
  setAuthMessage("Resetting password...");

  fetch("/api/account/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, password }),
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to reset password.");
      }

      setAuthMessage(payload.message);
      toggleResetMode(false);
      document.getElementById("loginEmail").value = email;
      document.getElementById("loginPassword").value = "";
      document.getElementById("resetCode").value = "";
      document.getElementById("resetPassword").value = "";
    })
    .catch((error) => {
      setAuthMessage(error.message);
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
        updateDashboard();
        return;
      }

      renderLinkedSummary(payload);
      updateDashboard();
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
      return syncConnectedWorkspace({ autoFill: true });
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
  if (!state.user) {
    setPlaidMessage("Sign in before linking accounts.");
    return;
  }

  if (!isEmailVerified()) {
    setPlaidMessage("Verify your email in Account before linking bank accounts.");
    return;
  }

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

function importPlaidTransactions(options = {}) {
  const { silent = false } = options;
  if (!state.user) {
    setPlaidMessage("Sign in before refreshing connected data.");
    return Promise.resolve();
  }

  if (!isEmailVerified()) {
    setPlaidMessage("Verify your email in Account before refreshing connected data.");
    return Promise.resolve();
  }

  if (!silent) {
    setPlaidMessage("Refreshing connected account data...");
  }

  return fetch("/api/plaid/import-transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to import Plaid transactions.");
      }

      if (!silent) {
        setPlaidMessage(payload.message);
      }
      return loadTransactions().then(() => payload);
    })
    .catch((error) => {
      if (!silent) {
        setPlaidMessage(error.message);
      }
      throw error;
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
      if (!window.location.hash) {
        setActivePage(state.user ? "snapshot" : "home");
      }
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
      updatePlannerActionState();
    })
    .catch(() => {
      document.getElementById("auth-status").textContent = "Unavailable";
      document.getElementById("billing-status").textContent = "Unavailable";
      setAiStatus("Configuration is unavailable right now.");
    });
}

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scroll);
    if (target) {
      const pageParent = target.closest(".app-page");
      setActivePage(pageParent?.dataset.page || "home");
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

document.querySelectorAll("[data-auth-target]").forEach((button) => {
  button.addEventListener("click", () => {
    openAuthPanel(button.dataset.authTarget);
  });
});

document.getElementById("signup-form").addEventListener("submit", handleSignup);
document.getElementById("login-form").addEventListener("submit", handleLogin);
document.getElementById("reset-request-form").addEventListener("submit", handleResetPassword);
document.getElementById("show-reset-button").addEventListener("click", () => {
  toggleResetMode(true);
  setAuthMessage("Enter your email, request a code, then set a new password.");
});
document.getElementById("cancel-reset-button").addEventListener("click", () => {
  toggleResetMode(false);
  setAuthMessage("Back to login.");
});
document.getElementById("request-reset-button").addEventListener("click", handleRequestPasswordReset);
document.getElementById("logout-button").addEventListener("click", handleLogout);
document.getElementById("manage-billing-button").addEventListener("click", handleManageBilling);
document.getElementById("account-save-button").addEventListener("click", handleAccountSave);
document.getElementById("account-change-plan-button").addEventListener("click", handleAccountPlanChange);
document.getElementById("account-cancel-plan-button").addEventListener("click", handleCancelSubscription);
document.getElementById("account-billing-button").addEventListener("click", handleManageBilling);
document.getElementById("account-logout-button").addEventListener("click", handleLogout);
document.getElementById("account-resend-verification-button").addEventListener("click", handleSendVerification);
document.getElementById("account-verify-button").addEventListener("click", handleVerifyEmail);
document.querySelectorAll('input[name="accountPlan"], input[name="accountBillingInterval"]').forEach((input) => {
  input.addEventListener("change", refreshAccountPlanPreview);
});
document.getElementById("connect-accounts").addEventListener("click", connectPlaidAccounts);
document.getElementById("snapshot-sync-btn")?.addEventListener("click", () => {
  syncConnectedWorkspace();
});
document.getElementById("import-transactions").addEventListener("click", () => {
  syncConnectedWorkspace({ autoFill: false });
});
document.getElementById("save-plan").addEventListener("click", () => savePlanner(true));
document.getElementById("autofill-plan").addEventListener("click", autofillPlannerFromConnectedData);
document.getElementById("upgrade-button").addEventListener("click", handleUpgrade);
document.getElementById("account-upgrade-button").addEventListener("click", handleUpgrade);
document.getElementById("transaction-form").addEventListener("submit", createTransaction);
document.getElementById("ai-form").addEventListener("submit", handleAiSubmit);
document.getElementById("ai-question").addEventListener("keydown", handleAiInputKeydown);
document.getElementById("ai-reset-button").addEventListener("click", resetAiCoach);
document.getElementById("ai-dismiss-button").addEventListener("click", () => setAiWidgetOpen(false));
document.getElementById("ai-widget-launcher").addEventListener("click", () => setAiWidgetOpen(true));
document.getElementById("ai-widget-close").addEventListener("click", () => setAiWidgetOpen(false));
document.getElementById("subscription-cancel-close-button").addEventListener("click", () => setModalOpen("subscription-cancel-modal", false));
document.getElementById("subscription-cancel-confirm-button").addEventListener("click", () => {
  setModalOpen("subscription-cancel-modal", false);
  if (state.user?.retentionOfferUsed) {
    finishSubscriptionCancellation("cancel");
    return;
  }
  setModalOpen("subscription-offer-modal", true);
});
document.getElementById("subscription-offer-decline-button").addEventListener("click", () => {
  setModalOpen("subscription-offer-modal", false);
  finishSubscriptionCancellation("cancel");
});
document.getElementById("subscription-offer-accept-button").addEventListener("click", () => {
  setModalOpen("subscription-offer-modal", false);
  finishSubscriptionCancellation("accept_offer");
});
bindTransactionFilters();
document.querySelectorAll("[data-ai-question]").forEach((button) => {
  button.addEventListener("click", () => {
    setAiWidgetOpen(true);
    submitAiQuestion(button.dataset.aiQuestion);
  });
});

document.querySelectorAll("[data-password-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input) {
      return;
    }

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "Hide" : "Show";
    button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
});

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
renderAiMessages();
setAiWidgetOpen(false);
syncAiAvailability();
setAuthView(state.authMode);
setActivePage(window.location.hash.replace("#", "") || "home");
updatePlannerActionState();
loadConfig();
handleCheckoutReturn();
document.getElementById("txDate").value = new Date().toISOString().slice(0, 10);

