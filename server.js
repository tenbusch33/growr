const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const envPath = path.join(root, ".env");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
const accountsFile = path.join(dataDir, "accounts.json");
const plaidItemsFile = path.join(dataDir, "plaid-items.json");
const plannerFile = path.join(dataDir, "planners.json");
const sessionsFile = path.join(dataDir, "sessions.json");
const transactionsFile = path.join(dataDir, "transactions.json");

loadEnvFile(envPath);

const port = process.env.PORT || 3000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureDataStore();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(accountsFile)) {
    fs.writeFileSync(accountsFile, "[]", "utf8");
  }

  if (!fs.existsSync(plaidItemsFile)) {
    fs.writeFileSync(plaidItemsFile, "[]", "utf8");
  }

  if (!fs.existsSync(plannerFile)) {
    fs.writeFileSync(plannerFile, "[]", "utf8");
  }

  if (!fs.existsSync(sessionsFile)) {
    fs.writeFileSync(sessionsFile, "[]", "utf8");
  }

  if (!fs.existsSync(transactionsFile)) {
    fs.writeFileSync(transactionsFile, "[]", "utf8");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendJsonWithCookie(response, statusCode, payload, cookie) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": cookie,
  });
  response.end(JSON.stringify(payload));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((accumulator, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }

    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash };
}

function verifyPassword(password, account) {
  if (!account?.passwordHash || !account?.salt) {
    return false;
  }

  const attemptedHash = crypto.scryptSync(password, account.salt, 64);
  const storedHash = Buffer.from(account.passwordHash, "hex");
  return storedHash.length === attemptedHash.length && crypto.timingSafeEqual(storedHash, attemptedHash);
}

function createSession(userId) {
  const sessions = readJson(sessionsFile);
  const token = crypto.randomBytes(24).toString("hex");
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
  };

  sessions.push(session);
  writeJson(sessionsFile, sessions);
  return session;
}

function destroySession(token) {
  const sessions = readJson(sessionsFile).filter((session) => session.token !== token);
  writeJson(sessionsFile, sessions);
}

function getSessionAccount(request) {
  const cookies = parseCookies(request);
  const token = cookies.growr_session;
  if (!token) {
    return null;
  }

  const session = readJson(sessionsFile).find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  const account = readJson(accountsFile).find((entry) => entry.id === session.userId);
  if (!account) {
    return null;
  }

  return { token, account };
}

function publicAccount(account) {
  const trialEndsAt = account.trialEndsAt || null;
  const trialActive = Boolean(trialEndsAt && new Date(trialEndsAt).getTime() > Date.now());
  const trialDaysRemaining = trialActive
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    id: account.id,
    fullName: account.fullName,
    email: account.email,
    plan: account.plan,
    subscriptionActive: account.subscriptionActive !== false,
    emailVerified: Boolean(account.emailVerified),
    trialEndsAt,
    trialActive,
    trialDaysRemaining,
    createdAt: account.createdAt,
  };
}

function hasInvestmentAccess(account) {
  return account.plan === "bundle" && account.subscriptionActive !== false;
}

function sanitizePlannerForAccount(payload, account) {
  const sanitized = { ...payload };
  if (!hasInvestmentAccess(account)) {
    delete sanitized.age;
    delete sanitized.retirementAge;
    delete sanitized.retirementMonthlyGoal;
    delete sanitized.retirementIncomeOther;
    delete sanitized.k401Balance;
    delete sanitized.k401Contribution;
    delete sanitized.rothBalance;
    delete sanitized.rothContribution;
    delete sanitized.traditionalIraBalance;
    delete sanitized.traditionalIraContribution;
    delete sanitized.hsaBalance;
    delete sanitized.hsaContribution;
    delete sanitized.college529Balance;
    delete sanitized.college529Contribution;
    delete sanitized.brokerageBalance;
    delete sanitized.brokerageContribution;
    delete sanitized.forecastYears;
  }

  return sanitized;
}

function getConfig() {
  return {
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    stripeBudgetConfigured: Boolean(process.env.STRIPE_CHECKOUT_BUDGET_URL),
    stripeBundleConfigured: Boolean(process.env.STRIPE_CHECKOUT_BUNDLE_URL),
    stripeApiConfigured: Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_BUDGET &&
        process.env.STRIPE_PRICE_BUNDLE
    ),
    plaidConfigured: Boolean(
      process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.PLAID_ENV
    ),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    dataDir,
  };
}

function getCheckoutUrl(plan) {
  return plan === "bundle"
    ? process.env.STRIPE_CHECKOUT_BUNDLE_URL || ""
    : process.env.STRIPE_CHECKOUT_BUDGET_URL || "";
}

function isStripeApiConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_BUDGET &&
      process.env.STRIPE_PRICE_BUNDLE
  );
}

function getStripePriceId(plan) {
  return plan === "bundle" ? process.env.STRIPE_PRICE_BUNDLE || "" : process.env.STRIPE_PRICE_BUDGET || "";
}

function buildFormBody(entries) {
  const params = new URLSearchParams();
  entries.forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params;
}

async function stripeFormRequest(endpoint, entries) {
  const response = await fetch(`https://api.stripe.com${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: buildFormBody(entries),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed for ${endpoint}.`);
  }

  return data;
}

async function stripeGetRequest(endpoint) {
  const response = await fetch(`https://api.stripe.com${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ""}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed for ${endpoint}.`);
  }

  return data;
}

function getBaseUrl(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "http";
  return `${protocol}://${request.headers.host}`;
}

function updateAccount(accountId, updater) {
  const accounts = readJson(accountsFile);
  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) {
    return null;
  }

  updater(account);
  writeJson(accountsFile, accounts);
  return account;
}

function updateAccountByCustomerId(customerId, updater) {
  const accounts = readJson(accountsFile);
  const account = accounts.find((entry) => entry.stripeCustomerId === customerId);
  if (!account) {
    return null;
  }

  updater(account);
  writeJson(accountsFile, accounts);
  return account;
}

async function ensureStripeCustomer(account) {
  if (account.stripeCustomerId) {
    return account.stripeCustomerId;
  }

  const customer = await stripeFormRequest("/v1/customers", [
    ["email", account.email],
    ["name", account.fullName],
    ["metadata[userId]", account.id],
    ["metadata[plan]", account.plan],
  ]);

  updateAccount(account.id, (entry) => {
    entry.stripeCustomerId = customer.id;
  });

  return customer.id;
}

async function createSubscriptionCheckout(account, plan, request) {
  const customerId = await ensureStripeCustomer(account);
  const priceId = getStripePriceId(plan);
  const baseUrl = getBaseUrl(request);
  const session = await stripeFormRequest("/v1/checkout/sessions", [
    ["mode", "subscription"],
    ["customer", customerId],
    ["line_items[0][price]", priceId],
    ["line_items[0][quantity]", 1],
    ["success_url", `${baseUrl}/?checkout=success`],
    ["cancel_url", `${baseUrl}/?checkout=cancel`],
    ["allow_promotion_codes", true],
    ["metadata[userId]", account.id],
    ["metadata[plan]", plan],
    ["subscription_data[metadata][userId]", account.id],
    ["subscription_data[metadata][plan]", plan],
    ["subscription_data[trial_period_days]", 7],
  ]);

  updateAccount(account.id, (entry) => {
    entry.plan = plan;
    entry.subscriptionActive = false;
    entry.subscriptionStatus = "pending";
    entry.pendingPlan = plan;
  });

  return session;
}

async function createPortalSession(account, request) {
  if (!account.stripeCustomerId) {
    throw new Error("No Stripe customer found for this account.");
  }

  const baseUrl = getBaseUrl(request);
  return stripeFormRequest("/v1/billing_portal/sessions", [
    ["customer", account.stripeCustomerId],
    ["return_url", `${baseUrl}/`],
  ]);
}

function verifyStripeWebhook(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret || !signatureHeader) {
    return null;
  }

  const values = signatureHeader.split(",").reduce((accumulator, piece) => {
    const [key, value] = piece.split("=");
    accumulator[key] = value;
    return accumulator;
  }, {});

  if (!values.t || !values.v1) {
    return null;
  }

  const payload = `${values.t}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  const received = Buffer.from(values.v1, "hex");
  const calculated = Buffer.from(expected, "hex");
  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
    return null;
  }

  return true;
}

function handleStripeEvent(event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    if (userId) {
      updateAccount(userId, (account) => {
        account.stripeCustomerId = session.customer;
        account.stripeSubscriptionId = session.subscription;
        account.subscriptionStatus = "checkout_completed";
        account.pendingPlan = session.metadata?.plan || account.plan;
      });
    }
    return;
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    updateAccountByCustomerId(invoice.customer, (account) => {
      account.subscriptionActive = true;
      account.subscriptionStatus = "active";
      account.stripeSubscriptionId = invoice.subscription || account.stripeSubscriptionId;
      account.plan = account.pendingPlan || account.plan;
      delete account.pendingPlan;
    });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    updateAccountByCustomerId(invoice.customer, (account) => {
      account.subscriptionActive = false;
      account.subscriptionStatus = "past_due";
    });
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    updateAccountByCustomerId(subscription.customer, (account) => {
      account.stripeSubscriptionId = subscription.id;
      account.subscriptionStatus = subscription.status;
      account.subscriptionActive = ["active", "trialing"].includes(subscription.status);
    });
  }
}

function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.PLAID_ENV);
}

function getPlaidBaseUrl() {
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (env === "production") {
    return "https://production.plaid.com";
  }

  return env === "development"
    ? "https://development.plaid.com"
    : "https://sandbox.plaid.com";
}

function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function applyEmailVerificationState(account) {
  account.emailVerified = false;
  account.emailVerificationCode = generateVerificationCode();
  account.emailVerificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function applyPasswordResetState(account) {
  account.passwordResetCode = generateVerificationCode();
  account.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

async function sendEmailMessage({ to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY || ""}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Email send failed.");
  }

  return data;
}

async function sendVerificationEmail(account) {
  if (!isEmailConfigured()) {
    return { delivered: false };
  }

  const expiresAt = account.emailVerificationExpiresAt
    ? new Date(account.emailVerificationExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "soon";

  await sendEmailMessage({
    to: account.email,
    subject: "Verify your Growr account",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2>Welcome to Growr</h2>
        <p>Use this verification code to confirm your email address:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${account.emailVerificationCode}</p>
        <p>This code expires at ${expiresAt}.</p>
        <p>Growr helps you see where your money goes and what to do next.</p>
      </div>
    `,
  });

  return { delivered: true };
}

async function sendPasswordResetEmail(account) {
  if (!isEmailConfigured()) {
    return { delivered: false };
  }

  await sendEmailMessage({
    to: account.email,
    subject: "Reset your Growr password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2>Reset your Growr password</h2>
        <p>Use this reset code to create a new password:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${account.passwordResetCode}</p>
        <p>This code expires in 30 minutes.</p>
      </div>
    `,
  });

  return { delivered: true };
}

function requireVerifiedEmail(session, response, actionLabel) {
  if (!session?.account?.emailVerified) {
    sendJson(response, 403, {
      error: `Verify your email before ${actionLabel}.`,
    });
    return false;
  }

  return true;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-5-mini";
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function openAIResponsesRequest(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  return data;
}

function buildAiFinancialContext(account) {
  if (!account) {
    return {
      personalized: false,
      summary: "No signed-in user context is available. Answer as a general educational coach only.",
    };
  }

  const planner = readJson(plannerFile).find((entry) => entry.userId === account.id)?.data || null;
  const transactions = readJson(transactionsFile)
    .filter((entry) => entry.userId === account.id)
    .slice(-20);

  if (!planner) {
    return {
      personalized: false,
      summary: `User is signed in on the ${account.plan} plan, but no saved planner exists yet. Answer generally unless the question can be answered from basic account state alone.`,
    };
  }

  const income = Number(planner.income || 0);
  const housing = Number(planner.housing || 0);
  const essentials = Number(planner.essentials || 0);
  const creditCardPayment = Number(planner.creditCard || 0);
  const otherDebt = Number(planner.otherDebt || 0);
  const carPayment = Number(planner.carPayment || 0);
  const carCosts = Number(planner.carCosts || 0);
  const emergencyFund = Number(planner.emergencyFund || 0);
  const creditCardBalance = Number(planner.creditCardBalance || 0);
  const homeValue = Number(planner.homeValue || 0);
  const mortgageBalance = Number(planner.mortgageBalance || 0);
  const carValue = Number(planner.carValue || 0);
  const carLoanBalance = Number(planner.carLoanBalance || 0);
  const cashAssets = Number(planner.cashAssets || 0);
  const otherAssets = Number(planner.otherAssets || 0);
  const otherLiabilities = Number(planner.otherLiabilities || 0);
  const totalExpenses = housing + essentials + creditCardPayment + otherDebt + carPayment + carCosts;
  const leftover = income - totalExpenses;
  const essentialBase = housing + essentials || 1;
  const emergencyMonths = emergencyFund / essentialBase;
  const debtRatio = income ? (creditCardPayment + otherDebt + carPayment) / income : 0;
  const carRatio = income ? (carPayment + carCosts) / income : 0;
  const investmentTotal = [
    "k401Balance",
    "rothBalance",
    "traditionalIraBalance",
    "hsaBalance",
    "college529Balance",
    "brokerageBalance",
  ].reduce((sum, key) => sum + Number(planner[key] || 0), 0);
  const homeEquity = homeValue - mortgageBalance;
  const carEquity = carValue - carLoanBalance;
  const netWorth = homeValue + carValue + cashAssets + otherAssets + investmentTotal
    - mortgageBalance - carLoanBalance - otherLiabilities - creditCardBalance;
  const retirementAge = Number(planner.retirementAge || 0);
  const currentAge = Number(planner.age || 0);
  const retirementMonthlyGoal = Number(planner.retirementMonthlyGoal || 0);
  const retirementIncomeOther = Number(planner.retirementIncomeOther || 0);
  const retirementNeedFromPortfolio = Math.max(retirementMonthlyGoal - retirementIncomeOther, 0);
  const retirementNestEgg = retirementNeedFromPortfolio * 12 * 25;

  const categoryTotals = transactions.reduce((totals, entry) => {
    const key = entry.category || "other";
    totals[key] = (totals[key] || 0) + Number(entry.amount || 0);
    return totals;
  }, {});

  const topCategories = Object.entries(categoryTotals)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([category, amount]) => `${category}: $${Math.round(amount)}`);

  return {
    personalized: true,
    summary: [
      `Signed-in user plan: ${account.plan}.`,
      `Monthly income: $${Math.round(income)}. Estimated monthly expenses: $${Math.round(totalExpenses)}. Leftover: $${Math.round(leftover)}.`,
      `Credit card balance: $${Math.round(creditCardBalance)}. Emergency fund: $${Math.round(emergencyFund)} (${emergencyMonths.toFixed(1)} months).`,
      `Debt ratio: ${(debtRatio * 100).toFixed(0)}%. Car cost ratio: ${(carRatio * 100).toFixed(0)}%.`,
      `Home equity: $${Math.round(homeEquity)}. Car equity: $${Math.round(carEquity)}. Net worth estimate: $${Math.round(netWorth)}.`,
      `Investments tracked in planner: $${Math.round(investmentTotal)}.`,
      retirementAge
        ? `Retirement target age: ${Math.round(retirementAge)}. Desired monthly retirement income: $${Math.round(retirementMonthlyGoal)}. Other guaranteed retirement income: $${Math.round(retirementIncomeOther)}. Approximate nest egg needed for the remaining income target: $${Math.round(retirementNestEgg)}.`
        : `No retirement target is saved yet. Current age on file: ${Math.round(currentAge) || "unknown"}.`,
      topCategories.length
        ? `Recent spending categories: ${topCategories.join(", ")}.`
        : "No recent transaction history is available.",
    ].join(" "),
  };
}

function extractResponseText(payload) {
  if (payload.output_text) {
    return payload.output_text.trim();
  }

  const parts = [];
  (payload.output || []).forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    });
  });

  return parts.join("\n").trim();
}

async function plaidRequest(endpoint, payload) {
  const response = await fetch(`${getPlaidBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID || "",
      "PLAID-SECRET": process.env.PLAID_SECRET || "",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const message =
      data.error_message || data.display_message || `Plaid request failed for ${endpoint}.`;
    throw new Error(message);
  }

  return data;
}

function getStoredPlaidItemForUser(userId) {
  return readJson(plaidItemsFile).find((item) => item.userId === userId) || null;
}

function savePlaidItem(item) {
  const items = readJson(plaidItemsFile).filter((entry) => entry.userId !== item.userId);
  items.push(item);
  writeJson(plaidItemsFile, items);
}

function mapPlaidCategory(personalFinanceCategory, accountSubtype) {
  const primary = personalFinanceCategory?.primary || "";
  const detailed = personalFinanceCategory?.detailed || "";
  const categoryText = `${primary} ${detailed} ${accountSubtype || ""}`.toLowerCase();

  if (categoryText.includes("rent") || categoryText.includes("mortgage") || categoryText.includes("utilities")) {
    return "housing";
  }

  if (categoryText.includes("groceries") || categoryText.includes("food") || categoryText.includes("pharmacy")) {
    return "essentials";
  }

  if (categoryText.includes("loan") || categoryText.includes("credit") || categoryText.includes("debt")) {
    return "debt";
  }

  if (categoryText.includes("gas") || categoryText.includes("transport") || categoryText.includes("auto")) {
    return "car";
  }

  if (categoryText.includes("entertainment") || categoryText.includes("travel") || categoryText.includes("shopping")) {
    return "fun";
  }

  return "other";
}

function normalizeMerchantName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|co|corp|company|payment|debit|card|online|purchase|pos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectSubscriptionsFromTransactions(transactions) {
  const subscriptionKeywords = [
    "netflix",
    "spotify",
    "hulu",
    "disney",
    "apple",
    "google",
    "youtube",
    "adobe",
    "amazon prime",
    "planet fitness",
    "xbox",
    "playstation",
    "chatgpt",
    "dropbox",
    "canva",
    "max",
  ];
  const billKeywords = [
    "rent",
    "mortgage",
    "utility",
    "water",
    "electric",
    "internet",
    "phone",
    "wireless",
    "insurance",
    "loan",
    "credit card",
    "student loan",
    "car payment",
  ];

  const candidateGroups = new Map();

  transactions
    .filter((entry) => Number(entry.amount) > 0)
    .forEach((entry) => {
      const merchantKey = normalizeMerchantName(entry.merchant);
      if (!merchantKey || ["housing", "debt", "car"].includes(entry.category)) {
        return;
      }

      if (!candidateGroups.has(merchantKey)) {
        candidateGroups.set(merchantKey, []);
      }
      candidateGroups.get(merchantKey).push(entry);
    });

  const recurring = Array.from(candidateGroups.entries())
    .map(([merchantKey, entries]) => {
      const sorted = entries
        .slice()
        .sort((left, right) => new Date(left.date) - new Date(right.date));
      const intervals = [];
      for (let index = 1; index < sorted.length; index += 1) {
        const diff = Math.round(
          (new Date(sorted[index].date) - new Date(sorted[index - 1].date)) / (1000 * 60 * 60 * 24)
        );
        if (diff > 0) {
          intervals.push(diff);
        }
      }

      const amounts = sorted.map((entry) => Number(entry.amount) || 0);
      const avgAmount = average(amounts);
      const maxAmount = Math.max(...amounts, 0);
      const minAmount = Math.min(...amounts, maxAmount);
      const amountVariation = avgAmount ? (maxAmount - minAmount) / avgAmount : 0;
      const avgInterval = average(intervals);
      const manualTrue = sorted.some((entry) => entry.subscriptionStatus === "subscribed");
      const manualFalse = sorted.some((entry) => entry.subscriptionStatus === "ignored");
      const subscriptionKeywordMatch = subscriptionKeywords.some((keyword) => merchantKey.includes(keyword));
      const billKeywordMatch = billKeywords.some((keyword) => merchantKey.includes(keyword));
      const cadenceMatch = sorted.length >= 2 && avgInterval >= 20 && avgInterval <= 40 && amountVariation <= 0.45;
      const latest = sorted[sorted.length - 1];
      const billCategory = ["housing", "debt", "car"].includes(latest.category) || billKeywordMatch;
      const type = billCategory ? "bill" : "subscription";

      if (manualFalse || (!manualTrue && !subscriptionKeywordMatch && !billKeywordMatch && !cadenceMatch)) {
        return null;
      }

      return {
        merchantKey,
        merchant: latest.merchant,
        amount: Number(latest.amount) || avgAmount,
        averageAmount: avgAmount,
        averageIntervalDays: avgInterval || 30,
        transactionsCount: sorted.length,
        category: latest.category || "other",
        source: latest.source || "manual",
        nextReviewHint: avgInterval
          ? `About every ${Math.round(avgInterval)} days`
          : manualTrue
            ? "Marked as subscription"
            : "Recurring pattern detected",
        lastDate: latest.date,
        monthlyEstimate: avgInterval ? avgAmount * (30 / avgInterval) : avgAmount,
        transactionIds: sorted.map((entry) => entry.id),
        status: manualTrue ? "confirmed" : "detected",
        type,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.monthlyEstimate - left.monthlyEstimate);

  return {
    subscriptions: recurring.filter((item) => item.type === "subscription"),
    bills: recurring.filter((item) => item.type === "bill"),
  };
}

function buildPlannerAutofill(account, plaidSummary = null) {
  const planner = readJson(plannerFile).find((entry) => entry.userId === account.id)?.data || {};
  const transactions = readJson(transactionsFile).filter((entry) => entry.userId === account.id);
  const recent = transactions.filter((entry) => {
    const daysAgo = (Date.now() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo >= 0 && daysAgo <= 60;
  });

  const categoryTotals = recent.reduce((totals, entry) => {
    const amount = Number(entry.amount || 0);
    if (amount > 0) {
      totals[entry.category || "other"] = (totals[entry.category || "other"] || 0) + amount;
    }
    return totals;
  }, {});

  const deposits = recent.filter((entry) => Number(entry.amount || 0) < 0);
  const inferredIncome = Math.abs(deposits.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)) / 2;

  const autofill = {
    ...planner,
    income: Math.round(inferredIncome || Number(planner.income || 0)),
    housing: Math.round((categoryTotals.housing || 0) / 2 || Number(planner.housing || 0)),
    essentials: Math.round((categoryTotals.essentials || 0) / 2 || Number(planner.essentials || 0)),
    creditCard: Math.round((categoryTotals.debt || 0) / 2 || Number(planner.creditCard || 0)),
    otherDebt: Math.round(((categoryTotals.debt || 0) / 4) || Number(planner.otherDebt || 0)),
    carPayment: Math.round((categoryTotals.car || 0) / 2 || Number(planner.carPayment || 0)),
    carCosts: Math.round((categoryTotals.car || 0) / 4 || Number(planner.carCosts || 0)),
    emergencyFund: Math.round(
      plaidSummary?.cashTotal || Number(planner.emergencyFund || planner.cashAssets || 0)
    ),
    creditCardBalance: Math.round(
      plaidSummary?.creditCardDebt || Number(planner.creditCardBalance || 0)
    ),
    cashAssets: Math.round(plaidSummary?.cashTotal || Number(planner.cashAssets || 0)),
    otherLiabilities: Math.round(plaidSummary?.loanDebt || Number(planner.otherLiabilities || 0)),
  };

  return {
    planner: autofill,
    source: {
      transactionsReviewed: recent.length,
      usedLinkedAccounts: Boolean(plaidSummary),
      depositsFound: deposits.length,
    },
  };
}

function currencyAmount(value) {
  return typeof value === "number" ? value : 0;
}

function buildPlaidSummary(accountsData, liabilitiesData, holdingsData) {
  const accounts = (accountsData.accounts || []).map((account) => ({
    accountId: account.account_id,
    name: account.name,
    typeLabel: `${account.type}${account.subtype ? ` / ${account.subtype}` : ""}`,
    currentBalance: currencyAmount(account.balances?.current),
  }));

  const accountsById = new Map(accounts.map((account) => [account.accountId, account]));
  const creditLiabilities = liabilitiesData.liabilities?.credit || [];
  const mortgageLiabilities = liabilitiesData.liabilities?.mortgage || [];
  const studentLiabilities = liabilitiesData.liabilities?.student || [];

  const liabilities = [
    ...creditLiabilities.map((entry) => ({
      name: accountsById.get(entry.account_id)?.name || "Credit account",
      kind: "Credit card",
      amount: currencyAmount(entry.last_statement_balance),
    })),
    ...mortgageLiabilities.map((entry) => ({
      name: accountsById.get(entry.account_id)?.name || "Mortgage account",
      kind: "Mortgage",
      amount: currencyAmount(entry.outstanding_principal_balance),
    })),
    ...studentLiabilities.map((entry) => ({
      name: accountsById.get(entry.account_id)?.name || "Student loan",
      kind: "Student loan",
      amount: currencyAmount(entry.last_statement_balance),
    })),
  ];

  const holdingsByAccount = new Map();
  (holdingsData.holdings || []).forEach((holding) => {
    const previous = holdingsByAccount.get(holding.account_id) || { value: 0, holdingsCount: 0 };
    previous.value += currencyAmount(holding.institution_value);
    previous.holdingsCount += 1;
    holdingsByAccount.set(holding.account_id, previous);
  });

  const investments = (accountsData.accounts || [])
    .filter((account) => account.type === "investment")
    .map((account) => {
      const aggregate = holdingsByAccount.get(account.account_id) || {
        value: currencyAmount(account.balances?.current),
        holdingsCount: 0,
      };

      return {
        accountId: account.account_id,
        accountName: account.name,
        value: aggregate.value,
        holdingsCount: aggregate.holdingsCount,
      };
    });

  const cashTotal = accounts
    .filter((account) => account.typeLabel.startsWith("depository"))
    .reduce((sum, account) => sum + account.currentBalance, 0);

  const creditCardDebt = liabilities
    .filter((entry) => entry.kind === "Credit card")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const loanDebt = liabilities
    .filter((entry) => entry.kind !== "Credit card")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const investmentsTotal = investments.reduce((sum, entry) => sum + entry.value, 0);

  return {
    connected: true,
    cashTotal,
    creditCardDebt,
    loanDebt,
    investmentsTotal,
    accounts,
    liabilities,
    investments,
  };
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/stripe/webhook") {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      const verified = verifyStripeWebhook(rawBody, request.headers["stripe-signature"]);
      if (!verified) {
        sendJson(response, 400, { error: "Invalid Stripe signature." });
        return;
      }

      try {
        const event = JSON.parse(rawBody || "{}");
        handleStripeEvent(event);
        sendJson(response, 200, { received: true });
      } catch {
        sendJson(response, 400, { error: "Invalid Stripe webhook payload." });
      }
    });

    return;
  }

  if (request.method === "GET" && request.url === "/api/config") {
    sendJson(response, 200, getConfig());
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/api/session") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 200, { authenticated: false });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      account: publicAccount(session.account),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/signup") {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const fullName = String(payload.fullName || "").trim();
        const email = String(payload.email || "").trim().toLowerCase();
        const password = String(payload.password || "").trim();
        const plan = payload.plan === "bundle" ? "bundle" : "budget";

        if (!fullName || !email || !password) {
          sendJson(response, 400, { error: "Name, email, and password are required." });
          return;
        }

        const accounts = readJson(accountsFile);
        const existing = accounts.find((account) => account.email === email);
        if (existing) {
          sendJson(response, 409, { error: "An account with that email already exists." });
          return;
        }

        const credentials = hashPassword(password);
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const account = {
          id: `acct_${Date.now()}`,
          fullName,
          email,
          plan,
          subscriptionActive: true,
          subscriptionStatus: "trialing",
          trialEndsAt,
          salt: credentials.salt,
          passwordHash: credentials.passwordHash,
          createdAt: new Date().toISOString(),
        };

        applyEmailVerificationState(account);

        accounts.push(account);
        writeJson(accountsFile, accounts);
        const session = createSession(account.id);

        sendVerificationEmail(account).catch(() => null);

        if (isStripeApiConfigured()) {
          createSubscriptionCheckout(account, plan, request)
            .then((checkoutSession) => {
              sendJsonWithCookie(response, 200, {
                account: publicAccount(readJson(accountsFile).find((entry) => entry.id === account.id)),
                checkoutUrl: checkoutSession.url,
                message: isEmailConfigured()
                  ? "Your 7-day free trial started. Check your email for a verification code, then complete checkout to secure billing after the trial."
                  : "Your 7-day free trial started. Complete checkout to secure billing after the trial.",
              }, `growr_session=${session.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
            })
            .catch((error) => sendJson(response, 400, { error: error.message }));
          return;
        }

        const checkoutUrl = getCheckoutUrl(plan);
        sendJsonWithCookie(response, 200, {
          account: publicAccount(account),
          checkoutUrl,
          message: checkoutUrl
            ? isEmailConfigured()
              ? "Your 7-day free trial started, billing checkout was prepared, and a verification email was sent."
              : "Your 7-day free trial started, and billing checkout was prepared in a new tab."
            : isEmailConfigured()
              ? "Your 7-day free trial started. A verification email was sent, and the account was saved locally in demo mode."
              : "Your 7-day free trial started. Stripe checkout is not configured yet, so the account was saved locally in demo mode.",
        }, `growr_session=${session.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
      } catch {
        sendJson(response, 400, { error: "Invalid signup payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/login") {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const email = String(payload.email || "").trim().toLowerCase();
        const password = String(payload.password || "").trim();
        const account = readJson(accountsFile).find((entry) => entry.email === email);

        if (!account || !verifyPassword(password, account)) {
          sendJson(response, 401, { error: "Invalid email or password." });
          return;
        }

        const session = createSession(account.id);
        sendJsonWithCookie(response, 200, {
          account: publicAccount(account),
          message: "Logged in successfully.",
        }, `growr_session=${session.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
      } catch {
        sendJson(response, 400, { error: "Invalid login payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/account/request-password-reset") {
    readRequestBody(request)
      .then((body) => {
        const payload = JSON.parse(body || "{}");
        const email = String(payload.email || "").trim().toLowerCase();
        const accounts = readJson(accountsFile);
        const account = accounts.find((entry) => entry.email === email);

        if (!account) {
          sendJson(response, 200, {
            message: "If that email exists, a reset code is on the way.",
          });
          return;
        }

        applyPasswordResetState(account);
        writeJson(accountsFile, accounts);

        sendPasswordResetEmail(account)
          .then(() => {
            sendJson(response, 200, {
              message: "Reset code sent to your email.",
            });
          })
          .catch(() => {
            sendJson(response, 200, {
              message: "Reset code created. Email delivery is not configured yet.",
              debugCode: account.passwordResetCode,
            });
          });
      })
      .catch(() => {
        sendJson(response, 400, { error: "Invalid password reset request." });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/account/reset-password") {
    readRequestBody(request)
      .then((body) => {
        const payload = JSON.parse(body || "{}");
        const email = String(payload.email || "").trim().toLowerCase();
        const code = String(payload.code || "").trim();
        const password = String(payload.password || "").trim();
        const accounts = readJson(accountsFile);
        const account = accounts.find((entry) => entry.email === email);

        if (!account) {
          sendJson(response, 400, { error: "We could not find that account." });
          return;
        }

        if (!code || !password) {
          sendJson(response, 400, { error: "Email, reset code, and new password are required." });
          return;
        }

        const expiresAt = account.passwordResetExpiresAt
          ? new Date(account.passwordResetExpiresAt).getTime()
          : 0;

        if (!account.passwordResetCode || Date.now() > expiresAt) {
          sendJson(response, 400, { error: "That reset code has expired. Request a new one." });
          return;
        }

        if (account.passwordResetCode !== code) {
          sendJson(response, 400, { error: "That reset code does not match." });
          return;
        }

        const credentials = hashPassword(password);
        account.salt = credentials.salt;
        account.passwordHash = credentials.passwordHash;
        delete account.passwordResetCode;
        delete account.passwordResetExpiresAt;
        writeJson(accountsFile, accounts);

        sendJson(response, 200, {
          message: "Password updated. You can log in now.",
        });
      })
      .catch(() => {
        sendJson(response, 400, { error: "Invalid password reset payload." });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/logout") {
    const session = getSessionAccount(request);
    if (session) {
      destroySession(session.token);
    }

    sendJsonWithCookie(
      response,
      200,
      { message: "Logged out." },
      "growr_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    );
    return;
  }

  if (request.method === "POST" && request.url === "/api/account/upgrade") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before upgrading." });
      return;
    }

    const accounts = readJson(accountsFile);
    const account = accounts.find((entry) => entry.id === session.account.id);
    if (!account) {
      sendJson(response, 404, { error: "Account not found." });
      return;
    }

    if (isStripeApiConfigured()) {
      createSubscriptionCheckout(account, "bundle", request)
        .then((checkoutSession) => {
          sendJson(response, 200, {
            account: publicAccount(readJson(accountsFile).find((entry) => entry.id === account.id)),
            checkoutUrl: checkoutSession.url,
            message: "Bundle upgrade prepared in Stripe checkout.",
          });
        })
        .catch((error) => sendJson(response, 400, { error: error.message }));
      return;
    }

    account.plan = "bundle";
    account.subscriptionActive = true;
    writeJson(accountsFile, accounts);

    const checkoutUrl = getCheckoutUrl("bundle");
    sendJson(response, 200, {
      account: publicAccount(account),
      checkoutUrl,
      message: checkoutUrl
        ? "Bundle upgrade prepared in checkout."
        : "Bundle access enabled in local demo mode.",
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/account/profile") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before updating your account." });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const fullName = String(payload.fullName || "").trim();
        const email = String(payload.email || "").trim().toLowerCase();

        if (!fullName || !email) {
          sendJson(response, 400, { error: "Name and email are required." });
          return;
        }

        const accounts = readJson(accountsFile);
        const emailTaken = accounts.find(
          (entry) => entry.email === email && entry.id !== session.account.id
        );
        if (emailTaken) {
          sendJson(response, 409, { error: "That email is already in use by another account." });
          return;
        }

        const account = accounts.find((entry) => entry.id === session.account.id);
        if (!account) {
          sendJson(response, 404, { error: "Account not found." });
          return;
        }

        account.fullName = fullName;
        if (account.email !== email) {
          account.email = email;
          applyEmailVerificationState(account);
          sendVerificationEmail(account).catch(() => null);
        }
        writeJson(accountsFile, accounts);

        sendJson(response, 200, {
          account: publicAccount(account),
          message: account.emailVerified
            ? "Account details updated."
            : isEmailConfigured()
              ? "Account details updated. Check your email for a new verification code."
              : "Account details updated. Email verification is waiting on email delivery setup.",
        });
      } catch {
        sendJson(response, 400, { error: "Invalid account payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/account/send-verification") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before requesting verification." });
      return;
    }

    const account = updateAccount(session.account.id, (entry) => {
      applyEmailVerificationState(entry);
    });

    if (!account) {
      sendJson(response, 404, { error: "Account not found." });
      return;
    }

    sendVerificationEmail(account)
      .then(() => {
        sendJson(response, 200, {
          account: publicAccount(account),
          message: "Verification email sent.",
        });
      })
      .catch(() => {
        sendJson(response, 200, {
          account: publicAccount(account),
          message: "Verification code refreshed, but email delivery is not configured yet.",
          debugCode: account.emailVerificationCode,
        });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/account/verify-email") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before verifying your email." });
      return;
    }

    readRequestBody(request)
      .then((body) => {
        const payload = JSON.parse(body || "{}");
        const code = String(payload.code || "").trim();
        if (!code) {
          sendJson(response, 400, { error: "Verification code is required." });
          return;
        }

        const accounts = readJson(accountsFile);
        const account = accounts.find((entry) => entry.id === session.account.id);
        if (!account) {
          sendJson(response, 404, { error: "Account not found." });
          return;
        }

        const expiresAt = account.emailVerificationExpiresAt
          ? new Date(account.emailVerificationExpiresAt).getTime()
          : 0;

        if (!account.emailVerificationCode || Date.now() > expiresAt) {
          sendJson(response, 400, { error: "That verification code has expired. Send a new one." });
          return;
        }

        if (account.emailVerificationCode !== code) {
          sendJson(response, 400, { error: "That verification code does not match." });
          return;
        }

        account.emailVerified = true;
        delete account.emailVerificationCode;
        delete account.emailVerificationExpiresAt;
        writeJson(accountsFile, accounts);

        sendJson(response, 200, {
          account: publicAccount(account),
          message: "Email verified.",
        });
      })
      .catch(() => {
        sendJson(response, 400, { error: "Invalid verification payload." });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/billing/portal") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before managing billing." });
      return;
    }

    if (!requireVerifiedEmail(session, response, "opening billing")) {
      return;
    }

    if (!isStripeApiConfigured()) {
      sendJson(response, 400, { error: "Stripe API is not configured yet." });
      return;
    }

    createPortalSession(session.account, request)
      .then((portalSession) => {
        sendJson(response, 200, { url: portalSession.url });
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === "GET" && request.url === "/api/planner") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to load your saved plan." });
      return;
    }

    const planner = readJson(plannerFile).find((entry) => entry.userId === session.account.id);
    sendJson(response, 200, { planner: planner?.data || null });
    return;
  }

  if (request.method === "GET" && request.url === "/api/transactions") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to load transactions." });
      return;
    }

    const transactions = readJson(transactionsFile)
      .filter((entry) => entry.userId === session.account.id)
      .sort((first, second) => new Date(second.date) - new Date(first.date));
    sendJson(response, 200, { transactions });
    return;
  }

  if (request.method === "GET" && request.url === "/api/transactions/subscriptions") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to load subscriptions." });
      return;
    }

    const transactions = readJson(transactionsFile)
      .filter((entry) => entry.userId === session.account.id)
      .sort((first, second) => new Date(second.date) - new Date(first.date));
    const recurring = detectSubscriptionsFromTransactions(transactions);
    const total = recurring.subscriptions.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0);
    const billsTotal = recurring.bills.reduce((sum, item) => sum + Number(item.monthlyEstimate || 0), 0);
    sendJson(response, 200, {
      subscriptions: recurring.subscriptions,
      bills: recurring.bills,
      totalMonthlyEstimate: total,
      billsMonthlyEstimate: billsTotal,
      count: recurring.subscriptions.length,
      billsCount: recurring.bills.length,
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/planner/autofill") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to auto-fill your planner." });
      return;
    }

    const item = getStoredPlaidItemForUser(session.account.id);
    if (!item) {
      const fallback = buildPlannerAutofill(session.account, null);
      sendJson(response, 200, {
        planner: fallback.planner,
        message: "Auto-filled from saved transactions. Connect accounts for a more complete fill.",
        source: fallback.source,
      });
      return;
    }

    Promise.all([
      plaidRequest("/accounts/get", { access_token: item.accessToken }),
      plaidRequest("/liabilities/get", { access_token: item.accessToken }),
      plaidRequest("/investments/holdings/get", { access_token: item.accessToken }),
    ])
      .then(([accountsData, liabilitiesData, holdingsData]) => {
        const summary = buildPlaidSummary(accountsData, liabilitiesData, holdingsData);
        const autofill = buildPlannerAutofill(session.account, summary);
        sendJson(response, 200, {
          planner: autofill.planner,
          message: "Planner auto-filled from recent transactions and linked balances. Review before saving.",
          source: autofill.source,
        });
      })
      .catch(() => {
        const fallback = buildPlannerAutofill(session.account, null);
        sendJson(response, 200, {
          planner: fallback.planner,
          message: "Auto-filled from saved transactions. Linked account data was unavailable right now.",
          source: fallback.source,
        });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/transactions") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to save transactions." });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const transaction = {
          id: `tx_${Date.now()}`,
          userId: session.account.id,
          merchant: String(payload.merchant || "").trim(),
          amount: Number(payload.amount) || 0,
          category: String(payload.category || "other").trim(),
          date: String(payload.date || "").trim(),
          subscriptionStatus: "auto",
          createdAt: new Date().toISOString(),
        };

        if (!transaction.merchant || !transaction.amount || !transaction.date) {
          sendJson(response, 400, { error: "Merchant, amount, and date are required." });
          return;
        }

        const transactions = readJson(transactionsFile);
        transactions.push(transaction);
        writeJson(transactionsFile, transactions);
        sendJson(response, 200, { transaction });
      } catch {
        sendJson(response, 400, { error: "Invalid transaction payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/transactions/update") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to manage transactions." });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const id = String(payload.id || "").trim();
        const category = String(payload.category || "").trim();
        const subscriptionStatus =
          payload.subscriptionStatus === "subscribed" || payload.subscriptionStatus === "ignored"
            ? payload.subscriptionStatus
            : "auto";

        const transactions = readJson(transactionsFile);
        const transaction = transactions.find(
          (entry) => entry.userId === session.account.id && entry.id === id
        );

        if (!transaction) {
          sendJson(response, 404, { error: "Transaction not found." });
          return;
        }

        if (category) {
          transaction.category = category;
        }
        transaction.subscriptionStatus = subscriptionStatus;
        transaction.updatedAt = new Date().toISOString();
        writeJson(transactionsFile, transactions);
        sendJson(response, 200, { transaction, message: "Transaction updated." });
      } catch {
        sendJson(response, 400, { error: "Invalid update payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/transactions/delete") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to manage transactions." });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const id = String(payload.id || "").trim();
        const transactions = readJson(transactionsFile).filter(
          (entry) => !(entry.userId === session.account.id && entry.id === id)
        );
        writeJson(transactionsFile, transactions);
        sendJson(response, 200, { message: "Transaction deleted." });
      } catch {
        sendJson(response, 400, { error: "Invalid delete payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/planner") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to save your plan." });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const planners = readJson(plannerFile).filter((entry) => entry.userId !== session.account.id);
        planners.push({
          userId: session.account.id,
          updatedAt: new Date().toISOString(),
          data: sanitizePlannerForAccount(payload, session.account),
        });
        writeJson(plannerFile, planners);
        sendJson(response, 200, { message: "Plan saved." });
      } catch {
        sendJson(response, 400, { error: "Invalid planner payload." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/plaid/create-link-token") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before linking Plaid accounts." });
      return;
    }

    if (!requireVerifiedEmail(session, response, "linking bank accounts")) {
      return;
    }

    if (!isPlaidConfigured()) {
      sendJson(response, 400, {
        error: "Plaid is not configured yet. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.",
      });
      return;
    }

    plaidRequest("/link/token/create", {
      client_name: "Growr",
      country_codes: ["US"],
      language: "en",
      user: { client_user_id: session.account.id },
      products: ["transactions", "liabilities", "investments"],
    })
      .then((data) => sendJson(response, 200, { link_token: data.link_token }))
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === "POST" && request.url === "/api/plaid/exchange-public-token") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before linking Plaid accounts." });
      return;
    }

    if (!requireVerifiedEmail(session, response, "linking bank accounts")) {
      return;
    }

    if (!isPlaidConfigured()) {
      sendJson(response, 400, {
        error: "Plaid is not configured yet. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.",
      });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const publicToken = String(payload.public_token || "").trim();
        if (!publicToken) {
          sendJson(response, 400, { error: "public_token is required." });
          return;
        }

        const exchange = await plaidRequest("/item/public_token/exchange", {
          public_token: publicToken,
        });

        savePlaidItem({
          userId: session.account.id,
          itemId: exchange.item_id,
          accessToken: exchange.access_token,
          transactionsCursor: null,
          linkedAt: new Date().toISOString(),
          institution: payload.metadata?.institution || null,
        });

        sendJson(response, 200, {
          message: "Plaid connection saved. Live balances and debts are ready to load.",
        });
      } catch (error) {
        sendJson(response, 400, { error: error.message || "Unable to link accounts." });
      }
    });

    return;
  }

  if (request.method === "POST" && request.url === "/api/plaid/import-transactions") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before importing transactions." });
      return;
    }

    if (!requireVerifiedEmail(session, response, "importing Plaid transactions")) {
      return;
    }

    if (!isPlaidConfigured()) {
      sendJson(response, 400, {
        error: "Plaid is not configured yet. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.",
      });
      return;
    }

    const plaidItem = getStoredPlaidItemForUser(session.account.id);
    if (!plaidItem) {
      sendJson(response, 404, { error: "No Plaid item is linked for this user." });
      return;
    }

    const allAdded = [];
    let cursor = plaidItem.transactionsCursor || null;
    let hasMore = true;

    const syncNext = () =>
      plaidRequest("/transactions/sync", {
        access_token: plaidItem.accessToken,
        cursor,
        count: 100,
      })
        .then((sync) => {
          allAdded.push(...(sync.added || []));
          cursor = sync.next_cursor || cursor;
          hasMore = Boolean(sync.has_more);
          if (hasMore) {
            return syncNext();
          }

          const existingTransactions = readJson(transactionsFile);
          const existingIds = new Set(
            existingTransactions
              .filter((entry) => entry.userId === session.account.id && entry.sourceTransactionId)
              .map((entry) => entry.sourceTransactionId)
          );

          const imported = [];
          const accountMap = new Map();
          return plaidRequest("/accounts/get", { access_token: plaidItem.accessToken }).then((accountsData) => {
            (accountsData.accounts || []).forEach((account) => {
              accountMap.set(account.account_id, account);
            });

            allAdded.forEach((transaction) => {
              if (transaction.pending || existingIds.has(transaction.transaction_id)) {
                return;
              }

              const account = accountMap.get(transaction.account_id);
              const localTransaction = {
                id: `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                userId: session.account.id,
                merchant: transaction.merchant_name || transaction.name || "Imported transaction",
                amount: Number(transaction.amount) || 0,
                category: mapPlaidCategory(
                  transaction.personal_finance_category,
                  account?.subtype
                ),
                date: transaction.date,
                createdAt: new Date().toISOString(),
                source: "plaid",
                sourceTransactionId: transaction.transaction_id,
                subscriptionStatus: "auto",
              };

              existingTransactions.push(localTransaction);
              imported.push(localTransaction);
            });

            writeJson(transactionsFile, existingTransactions);
            savePlaidItem({
              ...plaidItem,
              transactionsCursor: cursor,
            });

            sendJson(response, 200, {
              importedCount: imported.length,
              message: imported.length
                ? `Imported ${imported.length} Plaid transactions.`
                : "No new Plaid transactions were available to import.",
            });
          });
        })
        .catch((error) => {
          sendJson(response, 400, { error: error.message });
        });

    syncNext();
    return;
  }

  if (request.method === "GET" && request.url === "/api/plaid/summary") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in to load linked account data." });
      return;
    }

    if (!requireVerifiedEmail(session, response, "loading linked account data")) {
      return;
    }

    if (!isPlaidConfigured()) {
      sendJson(response, 400, {
        error: "Plaid is not configured yet. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.",
      });
      return;
    }

    const item = getStoredPlaidItemForUser(session.account.id);
    if (!item) {
      sendJson(response, 404, { connected: false });
      return;
    }

    Promise.all([
      plaidRequest("/accounts/get", { access_token: item.accessToken }),
      plaidRequest("/liabilities/get", { access_token: item.accessToken }),
      plaidRequest("/investments/holdings/get", { access_token: item.accessToken }),
    ])
      .then(([accountsData, liabilitiesData, holdingsData]) => {
        const summary = buildPlaidSummary(accountsData, liabilitiesData, holdingsData);
        if (!hasInvestmentAccess(session.account)) {
          summary.investmentsTotal = 0;
          summary.investments = [];
        }

        sendJson(response, 200, summary);
      })
      .catch((error) => {
        sendJson(response, 400, { error: error.message });
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/ai/coach") {
    if (!isOpenAIConfigured()) {
      sendJson(response, 400, {
        error: "Ask Growr is not configured yet. Add OPENAI_API_KEY to enable AI answers.",
      });
      return;
    }

    readRequestBody(request)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}");
        const question = String(payload.question || "").trim();
        const previousResponseId = String(payload.previousResponseId || "").trim();
        const session = getSessionAccount(request);
        const aiContext = buildAiFinancialContext(session?.account || null);

        if (!question) {
          sendJson(response, 400, { error: "A question is required." });
          return;
        }

        if (question.length > 1200) {
          sendJson(response, 400, { error: "Keep questions under 1,200 characters for now." });
          return;
        }

        const aiResponse = await openAIResponsesRequest({
          model: getOpenAIModel(),
          instructions: [
            "You are Growr, a friendly financial education coach inside a budgeting app.",
            "Answer in plain English for everyday users.",
            "You can explain 401(k), Roth IRA, Traditional IRA, HSA, brokerage, taxes, debt payoff, budgeting, and net worth concepts.",
            "When user-specific context is provided, use it carefully and call out that you are giving educational guidance, not legal, tax, or investment advice.",
            "Do not tell users to take extreme actions without explaining tradeoffs. Keep answers practical, supportive, and concise.",
            "If a question touches taxes or regulations, explain the general rule and suggest confirming details with a tax professional because rules can vary.",
          ].join(" "),
          previous_response_id: previousResponseId || undefined,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Context for this answer: ${aiContext.summary}\n\nUser question: ${question}`,
                },
              ],
            },
          ],
        });

        const answer = extractResponseText(aiResponse);
        sendJson(response, 200, {
          answer: answer || "I could not form a useful answer yet. Please try asking that a different way.",
          responseId: aiResponse.id || null,
          personalized: aiContext.personalized,
        });
      })
      .catch((error) => {
        sendJson(response, 400, { error: error.message || "Unable to answer that question." });
      });

    return;
  }

  const incomingPath = request.url === "/" ? "/index.html" : request.url;
  const safePath = path.normalize(incomingPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, () => {
  console.log(`Growr running at http://localhost:${port}`);
});
