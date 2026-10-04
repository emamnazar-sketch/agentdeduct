const FEEDBACK_ANON_ID_KEY = "agentDeduct.analyticsId.v1";
const form = document.querySelector("#feedbackForm");
const statusEl = document.querySelector("#feedbackStatus");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Sending feedback...";

  const formData = new FormData(form);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    feedbackType: formData.get("feedback_type"),
    message: formData.get("message"),
    page: location.pathname,
    anonId: getAnonId(),
    userAgent: navigator.userAgent,
  };

  try {
    const response = await fetch("/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Feedback failed");
    form.reset();
    statusEl.textContent = "Thank you. Your feedback was submitted.";
  } catch {
    statusEl.textContent = "Feedback could not be sent. Please try again.";
  }
});

function getAnonId() {
  let id = localStorage.getItem(FEEDBACK_ANON_ID_KEY);
  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(FEEDBACK_ANON_ID_KEY, id);
  }
  return id;
}

