const CATEGORIES = {
  desk_fees: {
    label: "Desk fees",
    rule: "Tracks brokerage desk, office, or transaction platform fees.",
    line: "Commissions and fees",
    rate: 1,
  },
  mileage: {
    label: "Vehicle mileage",
    rule: "Uses the 2026 IRS business mileage rate by default: 72.5 cents per mile.",
    line: "Car and truck expenses",
    rate: 1,
    mileage: true,
  },
  vehicle_actual: {
    label: "Vehicle actual expenses",
    rule: "Tracks actual vehicle costs using the business-use percentage you enter.",
    line: "Car and truck expenses",
    rate: 1,
  },
  office_tech: {
    label: "Office and technology",
    rule: "Computer, software, supplies, CRM, lockbox, and similar business tools.",
    line: "Office expense",
    rate: 1,
  },
  meals: {
    label: "Meals on the job",
    rule: "AgentDeduct estimates the deductible portion at 50% of the business amount.",
    line: "Meals",
    rate: 0.5,
  },
  license_education: {
    label: "License and education",
    rule: "License renewal, CE classes, MLS-required courses, and professional education.",
    line: "Legal and professional services / other expenses",
    rate: 1,
  },
  advertising: {
    label: "Advertising and printing",
    rule: "Signage, mailers, listing flyers, printing, postage, ads, and open house materials.",
    line: "Advertising",
    rate: 1,
  },
  website: {
    label: "Website development",
    rule: "Website build, hosting, maintenance, IDX, domain, and landing pages.",
    line: "Advertising / other expenses",
    rate: 1,
  },
  insurance: {
    label: "E&O insurance",
    rule: "Errors and omissions and other business insurance premiums.",
    line: "Insurance",
    rate: 1,
  },
  internet_cell: {
    label: "Internet and cell phone",
    rule: "Uses the business-use percentage you enter for mixed personal/business service.",
    line: "Utilities / other expenses",
    rate: 1,
  },
  other: {
    label: "Other business expense",
    rule: "Use this for a real estate business expense that does not fit the preset categories.",
    line: "Other expenses",
    rate: 1,
  },
};

const STORAGE_KEY = "agentDeduct.expenses.v1";
const ANON_ID_KEY = "agentDeduct.analyticsId.v1";
const WELCOME_KEY = "agentDeduct.welcomeAccepted.v1";
const state = {
  expenses: [],
  year: String(new Date().getFullYear()),
  view: "yearly",
  month: new Date().toISOString().slice(0, 7),
  anonId: "",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const els = {
  taxYear: document.querySelector("#taxYear"),
  yearlyView: document.querySelector("#yearlyView"),
  monthlyView: document.querySelector("#monthlyView"),
  reportMonth: document.querySelector("#reportMonth"),
  monthPickerWrap: document.querySelector("#monthPickerWrap"),
  reportRangeLabel: document.querySelector("#reportRangeLabel"),
  periodCaption: document.querySelector("#periodCaption"),
  deductibleTotal: document.querySelector("#deductibleTotal"),
  spentTotal: document.querySelector("#spentTotal"),
  expenseCount: document.querySelector("#expenseCount"),
  receiptCount: document.querySelector("#receiptCount"),
  mileageTotal: document.querySelector("#mileageTotal"),
  reportCount: document.querySelector("#reportCount"),
  deductionDonut: document.querySelector("#deductionDonut"),
  recentExpenses: document.querySelector("#recentExpenses"),
  form: document.querySelector("#expenseForm"),
  date: document.querySelector("#date"),
  category: document.querySelector("#category"),
  amount: document.querySelector("#amount"),
  businessUse: document.querySelector("#businessUse"),
  vendor: document.querySelector("#vendor"),
  purpose: document.querySelector("#purpose"),
  receipt: document.querySelector("#receipt"),
  receiptName: document.querySelector("#receiptName"),
  ocrStatus: document.querySelector("#ocrStatus"),
  deductionHint: document.querySelector("#deductionHint"),
  amountFields: document.querySelector("#amountFields"),
  mileageFields: document.querySelector("#mileageFields"),
  miles: document.querySelector("#miles"),
  mileageRate: document.querySelector("#mileageRate"),
  rows: document.querySelector("#expenseRows"),
  totals: document.querySelector("#categoryTotals"),
  emptyState: document.querySelector("#emptyState"),
  topAttachReceipt: document.querySelector("#topAttachReceipt"),
  exportCsv: document.querySelector("#exportCsv"),
  exportBackup: document.querySelector("#exportBackup"),
  importBackup: document.querySelector("#importBackup"),
  backupFile: document.querySelector("#backupFile"),
  printReport: document.querySelector("#printReport"),
  clearAll: document.querySelector("#clearAll"),
  welcomeModal: document.querySelector("#welcomeModal"),
  acceptWelcome: document.querySelector("#acceptWelcome"),
};

function init() {
  state.anonId = getAnonId();
  hydrateYears();
  hydrateCategories();
  load();
  els.date.valueAsDate = new Date();
  els.taxYear.value = state.year;
  els.reportMonth.value = state.month;
  updatePeriodControls();
  render();
  bindEvents();
  showWelcomeIfNeeded();
  trackEvent("app_opened");
}

function hydrateYears() {
  const current = new Date().getFullYear();
  for (let year = current - 2; year <= current + 1; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    els.taxYear.append(option);
  }
}

function hydrateCategories() {
  Object.entries(CATEGORIES).forEach(([id, category]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = category.label;
    els.category.append(option);
  });
  updateCategoryUi();
}

function bindEvents() {
  els.form.addEventListener("submit", saveExpense);
  els.category.addEventListener("change", updateCategoryUi);
  els.receipt.addEventListener("change", handleReceiptChange);
  els.topAttachReceipt.addEventListener("click", () => els.receipt.click());
  els.importBackup.addEventListener("click", () => els.backupFile.click());
  els.backupFile.addEventListener("change", importBackup);
  els.acceptWelcome.addEventListener("click", acceptWelcome);
  els.yearlyView.addEventListener("click", () => setReportView("yearly"));
  els.monthlyView.addEventListener("click", () => setReportView("monthly"));
  els.reportMonth.addEventListener("change", () => {
    state.month = els.reportMonth.value || state.month;
    if (state.month) state.year = state.month.slice(0, 4);
    els.taxYear.value = state.year;
    updatePeriodControls();
    render();
  });
  els.taxYear.addEventListener("change", () => {
    state.year = els.taxYear.value;
    if (state.view === "monthly") {
      const month = state.month.slice(5, 7) || "01";
      state.month = `${state.year}-${month}`;
      els.reportMonth.value = state.month;
    }
    updatePeriodControls();
    render();
  });
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportBackup.addEventListener("click", exportBackup);
  els.printReport.addEventListener("click", () => {
    trackEvent("report_printed");
    window.print();
  });
  els.clearAll.addEventListener("click", clearAll);
}

function updateCategoryUi() {
  const category = CATEGORIES[els.category.value];
  els.deductionHint.textContent = category.rule;
  els.mileageFields.classList.toggle("hidden", !category.mileage);
  els.amountFields.classList.toggle("hidden", Boolean(category.mileage));
  els.amount.required = !category.mileage;
  els.miles.required = Boolean(category.mileage);
  els.amount.disabled = Boolean(category.mileage);
  els.businessUse.disabled = Boolean(category.mileage);
  els.miles.disabled = !category.mileage;
  els.mileageRate.disabled = !category.mileage;
}

function setReportView(view) {
  state.view = view;
  if (view === "monthly" && !state.month) {
    state.month = `${state.year}-01`;
    els.reportMonth.value = state.month;
  }
  updatePeriodControls();
  render();
}

function updatePeriodControls() {
  const isMonthly = state.view === "monthly";
  els.yearlyView.classList.toggle("active", !isMonthly);
  els.monthlyView.classList.toggle("active", isMonthly);
  els.monthPickerWrap.classList.toggle("hidden", !isMonthly);
  els.reportRangeLabel.textContent = isMonthly ? `${monthLabel(state.month)} report` : `${state.year} yearly report`;
  els.periodCaption.textContent = isMonthly ? monthLabel(state.month) : "This year";
}

async function handleReceiptChange() {
  updateReceiptName();
  const file = els.receipt.files[0];
  if (!file) {
    setOcrStatus("Receipt auto-fill is experimental. Review vendor, date, amount, and category before saving.");
    return;
  }

  trackEvent("receipt_attached");
  if (!file.type.startsWith("image/")) {
    setOcrStatus("PDF receipts are attached only in this test version. Enter the fields manually.", "warning");
    return;
  }

  await scanReceipt(file);
}

function updateReceiptName() {
  els.receiptName.textContent = els.receipt.files[0]?.name || "No receipt attached";
}

async function scanReceipt(file) {
  if (!window.Tesseract) {
    setOcrStatus("Receipt auto-fill is unavailable right now. You can still enter it manually.", "warning");
    trackEvent("ocr_scan_failed");
    return;
  }

  try {
    trackEvent("ocr_scan_attempted");
    setOcrStatus("Scanning receipt on this device...", "working");
    const result = await Tesseract.recognize(file, "eng", {
      logger(message) {
        if (message.status === "recognizing text" && message.progress) {
          setOcrStatus(`Scanning receipt on this device... ${Math.round(message.progress * 100)}%`, "working");
        }
      },
    });
    const parsed = parseReceiptText(result.data.text || "");
    applyReceiptFields(parsed);
    const filled = [
      parsed.date && "date",
      parsed.vendor && "vendor",
      parsed.amount && "amount",
      parsed.categoryId && "category",
    ].filter(Boolean);
    if (filled.length) {
      setOcrStatus(`Auto-filled ${filled.join(", ")}. Please review before saving.`, "success");
    } else {
      setOcrStatus("Receipt attached. I could not read enough details, so please enter the fields manually.", "warning");
    }
  } catch {
    trackEvent("ocr_scan_failed");
    setOcrStatus("Receipt attached. Auto-fill could not read this image, so please enter it manually.", "warning");
  }
}

function setOcrStatus(message, tone = "") {
  els.ocrStatus.textContent = message;
  els.ocrStatus.className = `ocr-status ${tone}`.trim();
}

function parseReceiptText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|_*~]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1);
  const vendor = findVendor(lines);
  const date = findDate(lines.join(" "));
  const amount = findTotal(lines);
  const categoryId = inferCategory(`${vendor} ${lines.join(" ")}`);

  return { vendor, date, amount, categoryId };
}

function findVendor(lines) {
  const blocked = /^(receipt|invoice|order|date|time|total|subtotal|tax|change|cash|visa|mastercard|amex|debit|credit|auth|merchant|customer|copy|thank you|sale|terminal|approval|ref|id|www\.|http|tel|phone|address)/i;
  const topLines = lines.slice(0, 8);
  const vendorLine = topLines.find((line) => {
    const clean = line.replace(/[^a-z0-9&.' -]/gi, "").trim();
    const hasLetter = /[a-z]/i.test(line);
    const isMostlyNumbers = line.replace(/\D/g, "").length > line.length / 2;
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    const hasStreetNoise = /\b(st|street|ave|avenue|blvd|road|rd|suite|ste|ca|ny|tx|zip)\b/i.test(clean);
    return hasLetter && !isMostlyNumbers && wordCount <= 5 && clean.length >= 3 && !hasStreetNoise && !blocked.test(clean);
  });
  if (!vendorLine) return "";
  return vendorLine.replace(/[^a-z0-9&.' -]/gi, "").trim().slice(0, 50);
}

function findDate(text) {
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = normalizeYear(Number(numeric[3]));
    return toDateInput(year, month, day);
  }

  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/i,
  );
  if (named) {
    const month = monthNumber(named[1]);
    const day = Number(named[2]);
    const year = normalizeYear(Number(named[3]));
    return toDateInput(year, month, day);
  }

  return "";
}

function normalizeYear(year) {
  if (year < 100) return year + 2000;
  return year;
}

function toDateInput(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(name) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    name.slice(0, 3).toLowerCase(),
  ) + 1;
}

function findTotal(lines) {
  const moneyPattern = /\$?\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2}))/g;
  const totalLines = lines.filter((line) => /\b(total|amount due|balance|sale)\b/i.test(line) && !/\b(subtotal|tax|tip|change)\b/i.test(line));

  for (const line of totalLines.reverse()) {
    const amounts = extractAmounts(line, moneyPattern);
    if (amounts.length) return amounts.at(-1);
  }

  const allAmounts = lines.flatMap((line) => extractAmounts(line, moneyPattern));
  const reasonableAmounts = allAmounts.filter((amount) => amount > 0 && amount < 100000);
  return reasonableAmounts.length ? Math.max(...reasonableAmounts) : 0;
}

function extractAmounts(line, pattern) {
  return [...line.matchAll(pattern)].map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite);
}

function inferCategory(text) {
  const value = text.toLowerCase();
  const rules = [
    ["meals", /\b(restaurant|cafe|coffee|bistro|grill|pizza|deli|doordash|ubereats|starbucks|panera|chipotle|mcdonald|burger|lunch|dinner)\b/],
    ["internet_cell", /\b(verizon|at&t|att|tmobile|t-mobile|xfinity|comcast|spectrum|internet|wireless|phone|mobile)\b/],
    ["office_tech", /\b(office depot|staples|best buy|apple|microsoft|adobe|canva|software|printer|ink|paper|supplies|laptop|computer)\b/],
    ["advertising", /\b(zillow|realtor.com|facebook|meta|google ads|printing|postcard|sign|mailer|flyer|advertising|marketing)\b/],
    ["website", /\b(domain|hosting|website|godaddy|squarespace|wix|wordpress|idx)\b/],
    ["insurance", /\b(insurance|e&o|errors and omissions|premium)\b/],
    ["license_education", /\b(license|renewal|education|course|class|training|mls|association|nar)\b/],
    ["desk_fees", /\b(desk fee|brokerage|transaction fee|office fee)\b/],
    ["vehicle_actual", /\b(gas|fuel|shell|chevron|exxon|mobil|arco|valero|parking|toll|wash|maintenance|repair|oil)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || "";
}

function applyReceiptFields(parsed) {
  if (parsed.date) els.date.value = parsed.date;
  if (parsed.vendor && !els.vendor.value.trim()) els.vendor.value = parsed.vendor;
  if (parsed.amount && !CATEGORIES[els.category.value].mileage) els.amount.value = parsed.amount.toFixed(2);
  if (parsed.categoryId) {
    els.category.value = parsed.categoryId;
    updateCategoryUi();
  }
  if (!els.purpose.value.trim()) {
    const vendorText = parsed.vendor ? ` from ${parsed.vendor}` : "";
    els.purpose.value = `Business expense${vendorText}. Review purpose before saving.`;
  }
}

async function saveExpense(event) {
  event.preventDefault();
  const category = CATEGORIES[els.category.value];
  const receipt = await readReceipt();
  const businessUse = Number(els.businessUse.value || 100) / 100;
  const miles = Number(els.miles.value || 0);
  const amount = category.mileage
    ? miles * Number(els.mileageRate.value || 0)
    : Number(els.amount.value || 0);
  const deductible = category.mileage ? amount : amount * businessUse * category.rate;

  state.expenses.unshift({
    id: crypto.randomUUID(),
    date: els.date.value,
    categoryId: els.category.value,
    vendor: els.vendor.value.trim(),
    purpose: els.purpose.value.trim(),
    amount,
    deductible,
    businessUse,
    miles,
    mileageRate: Number(els.mileageRate.value || 0),
    receipt,
    createdAt: new Date().toISOString(),
  });

  persist();
  trackEvent("expense_saved");
  els.form.reset();
  els.date.valueAsDate = new Date();
  els.businessUse.value = 100;
  els.mileageRate.value = 0.725;
  els.receiptName.textContent = "No receipt attached";
  setOcrStatus("Receipt auto-fill is experimental. Review vendor, date, amount, and category before saving.");
  updateCategoryUi();
  render();
}

function readReceipt() {
  const file = els.receipt.files[0];
  if (!file) return Promise.resolve(null);
  if (file.type.startsWith("image/")) return compressImageReceipt(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        data: reader.result,
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImageReceipt(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const data = canvas.toDataURL("image/jpeg", 0.72);
        resolve({
          name: file.name.replace(/\.[^.]+$/, "") + "-compressed.jpg",
          originalName: file.name,
          type: "image/jpeg",
          compressed: true,
          originalSize: file.size,
          compressedSize: Math.round((data.length * 3) / 4),
          data,
        });
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function render() {
  const visible = expensesForPeriod();
  renderMetrics(visible);
  renderCategoryTotals(visible);
  renderRecentExpenses(visible);
  renderRows(visible);
}

function expensesForPeriod() {
  const prefix = state.view === "monthly" ? state.month : state.year;
  return state.expenses.filter((expense) => expense.date?.startsWith(prefix));
}

function renderMetrics(expenses) {
  const spent = sum(expenses, "amount");
  const deductible = sum(expenses, "deductible");
  const receipts = expenses.filter((expense) => expense.receipt).length;
  const miles = expenses.reduce((total, expense) => total + Number(expense.miles || 0), 0);

  els.spentTotal.textContent = `${money.format(spent)} spent`;
  els.deductibleTotal.textContent = money.format(deductible);
  els.expenseCount.textContent = String(expenses.length);
  els.receiptCount.textContent = String(receipts);
  els.mileageTotal.textContent = miles.toLocaleString("en-US", { maximumFractionDigits: 1 });
  els.reportCount.textContent = expenses.length ? "1" : "0";
  renderDonut(expenses);
}

function renderDonut(expenses) {
  const totals = Object.keys(CATEGORIES)
    .map((categoryId) => sum(expenses.filter((expense) => expense.categoryId === categoryId), "deductible"))
    .filter((value) => value > 0);

  if (!totals.length) {
    els.deductionDonut.style.background = "conic-gradient(#e3e8ee 0 100%)";
    return;
  }

  const colors = ["#176b47", "#0c315b", "#5aa868", "#aab7c7", "#a9781e", "#d8e4dc"];
  const total = totals.reduce((sumValue, value) => sumValue + value, 0);
  let cursor = 0;
  const stops = totals.map((value, index) => {
    const start = cursor;
    cursor += (value / total) * 100;
    return `${colors[index % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  els.deductionDonut.style.background = `conic-gradient(${stops.join(", ")})`;
}

function renderRecentExpenses(expenses) {
  els.recentExpenses.replaceChildren();
  const recent = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);

  if (!recent.length) {
    const empty = document.createElement("p");
    empty.className = "recent-empty";
    empty.textContent = "No expenses yet. Add an expense or attach a receipt to start the dashboard.";
    els.recentExpenses.append(empty);
    return;
  }

  recent.forEach((expense) => {
    const item = document.createElement("div");
    item.className = "recent-item";
    item.innerHTML = `
      <div>
        <strong>${CATEGORIES[expense.categoryId].label}</strong>
        <span>${formatDate(expense.date)} - ${expense.vendor || "No vendor"}</span>
      </div>
      <span class="recent-amount">${money.format(expense.deductible)}</span>
    `;
    els.recentExpenses.append(item);
  });
}

function renderCategoryTotals(expenses) {
  els.totals.replaceChildren();
  Object.entries(CATEGORIES).forEach(([id, category]) => {
    const categoryExpenses = expenses.filter((expense) => expense.categoryId === id);
    const deductible = sum(categoryExpenses, "deductible");
    const spent = sum(categoryExpenses, "amount");
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <div>
        <strong>${category.label}</strong>
        <span>${category.line} - spent ${money.format(spent)}</span>
      </div>
      <strong>${money.format(deductible)}</strong>
    `;
    els.totals.append(row);
  });
}

function renderRows(expenses) {
  els.rows.replaceChildren();

  if (!expenses.length) {
    els.rows.append(els.emptyState.content.cloneNode(true));
    return;
  }

  expenses.forEach((expense) => {
    const category = CATEGORIES[expense.categoryId];
    const row = document.createElement("tr");
    const receiptCell = expense.receipt
      ? `<a class="receipt-link" href="${expense.receipt.data}" target="_blank" rel="noreferrer">${expense.receipt.name}</a>`
      : "Missing";

    row.innerHTML = `
      <td>${formatDate(expense.date)}</td>
      <td>${category.label}<br><small>${expense.purpose}</small></td>
      <td>${expense.vendor}</td>
      <td>${money.format(expense.amount)}</td>
      <td>${money.format(expense.deductible)}</td>
      <td>${receiptCell}</td>
      <td><button class="delete" type="button" data-id="${expense.id}">Delete</button></td>
    `;
    els.rows.append(row);
  });

  els.rows.querySelectorAll(".delete").forEach((button) => {
    button.addEventListener("click", () => deleteExpense(button.dataset.id));
  });
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthLabel(value) {
  if (!value) return "Monthly";
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
}

function load() {
  try {
    state.expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    state.expenses = [];
  }
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  persist();
  render();
}

function clearAll() {
  if (!confirm("Clear all AgentDeduct test data from this browser?")) return;
  state.expenses = [];
  persist();
  render();
}

function showWelcomeIfNeeded() {
  if (localStorage.getItem(WELCOME_KEY) === "yes") return;
  els.welcomeModal.classList.remove("hidden");
}

function acceptWelcome() {
  localStorage.setItem(WELCOME_KEY, "yes");
  els.welcomeModal.classList.add("hidden");
}

function exportCsv() {
  const expenses = expensesForPeriod();
  const headers = [
    "Date",
    "Category",
    "Schedule C guide",
    "Vendor",
    "Business purpose",
    "Spent",
    "Deductible estimate",
    "Business use %",
    "Miles",
    "Receipt attached",
  ];
  const rows = expenses.map((expense) => {
    const category = CATEGORIES[expense.categoryId];
    return [
      expense.date,
      category.label,
      category.line,
      expense.vendor,
      expense.purpose,
      expense.amount.toFixed(2),
      expense.deductible.toFixed(2),
      Math.round(expense.businessUse * 100),
      expense.miles || "",
      expense.receipt ? "Yes" : "No",
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `AgentDeduct-${reportSlug()}-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
  trackEvent("csv_exported");
}

function exportBackup() {
  const payload = {
    app: "AgentDeduct",
    version: 1,
    exportedAt: new Date().toISOString(),
    taxYear: state.year,
    reportView: state.view,
    reportMonth: state.month,
    storage: "local browser only",
    expenses: state.expenses,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `AgentDeduct-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  trackEvent("data_downloaded");
}

async function importBackup() {
  const file = els.backupFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const imported = Array.isArray(backup.expenses) ? backup.expenses : null;

    if (!imported) {
      alert("This does not look like an AgentDeduct backup file.");
      return;
    }

    const shouldReplace = confirm(
      "Import this AgentDeduct backup? Choose OK to replace current local records with the backup.",
    );
    if (!shouldReplace) return;

    state.expenses = imported.filter((expense) => expense && expense.id && expense.date && expense.categoryId);
    persist();
    render();
    alert("Backup imported on this device.");
  } catch {
    alert("Could not import this backup file.");
  } finally {
    els.backupFile.value = "";
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function reportSlug() {
  return state.view === "monthly" ? state.month : state.year;
}

function getAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function trackEvent(event) {
  if (!state.anonId || location.protocol === "file:") return;
  const payload = JSON.stringify({
    event,
    anonId: state.anonId,
    page: location.pathname,
    device: window.matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop",
    appVersion: "public-test",
    userAgent: navigator.userAgent,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/.netlify/functions/track", new Blob([payload], { type: "application/json" }));
    return;
  }

  fetch("/.netlify/functions/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

init();
