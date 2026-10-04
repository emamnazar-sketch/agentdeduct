const form = document.querySelector("#adminForm");
const tokenInput = document.querySelector("#adminToken");
const loginPanel = document.querySelector("#loginPanel");
const metricsPanel = document.querySelector("#adminMetrics");
const statusPanel = document.querySelector("#adminStatus");

const fields = {
  totalVisits: document.querySelector("#totalVisits"),
  users: document.querySelector("#users"),
  expensesAdded: document.querySelector("#expensesAdded"),
  receiptsAttached: document.querySelector("#receiptsAttached"),
  csvExports: document.querySelector("#csvExports"),
  dataDownloads: document.querySelector("#dataDownloads"),
  ocrScansAttempted: document.querySelector("#ocrScansAttempted"),
  ocrScansFailed: document.querySelector("#ocrScansFailed"),
  updatedAt: document.querySelector("#updatedAt"),
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadDashboard(tokenInput.value.trim());
});

async function loadDashboard(token) {
  const response = await fetch("/.netlify/functions/dashboard", {
    headers: {
      "x-admin-token": token,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      alert("Dashboard function was not found. This usually means the site was deployed with drag-and-drop instead of a Netlify build that includes Functions.");
      return;
    }
    if (response.status === 401) {
      alert("Dashboard token was not accepted. Check the AGENTDEDUCT_ADMIN_TOKEN environment variable, make sure it includes the Functions scope, then redeploy.");
      return;
    }
    alert(`Dashboard could not load. Netlify returned status ${response.status}.`);
    return;
  }

  const stats = await response.json();
  fields.totalVisits.textContent = formatNumber(stats.totalVisits);
  fields.users.textContent = formatNumber(stats.users);
  fields.expensesAdded.textContent = formatNumber(stats.expensesAdded);
  fields.receiptsAttached.textContent = formatNumber(stats.receiptsAttached);
  fields.csvExports.textContent = formatNumber(stats.csvExports);
  fields.dataDownloads.textContent = formatNumber(stats.dataDownloads);
  fields.ocrScansAttempted.textContent = formatNumber(stats.ocrScansAttempted);
  fields.ocrScansFailed.textContent = formatNumber(stats.ocrScansFailed);
  fields.updatedAt.textContent = stats.updatedAt ? new Date(stats.updatedAt).toLocaleString() : "No activity yet";

  loginPanel.classList.add("hidden");
  metricsPanel.classList.remove("hidden");
  statusPanel.classList.remove("hidden");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}
