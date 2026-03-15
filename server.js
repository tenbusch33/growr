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

        accounts.push(account);
        writeJson(accountsFile, accounts);
        const session = createSession(account.id);

        if (isStripeApiConfigured()) {
          createSubscriptionCheckout(account, plan, request)
            .then((checkoutSession) => {
              sendJsonWithCookie(response, 200, {
                account: publicAccount(readJson(accountsFile).find((entry) => entry.id === account.id)),
                checkoutUrl: checkoutSession.url,
                message: "Your 7-day free trial started. Complete checkout to secure billing after the trial.",
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
            ? "Your 7-day free trial started, and billing checkout was prepared in a new tab."
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

  if (request.method === "POST" && request.url === "/api/billing/portal") {
    const session = getSessionAccount(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in before managing billing." });
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
