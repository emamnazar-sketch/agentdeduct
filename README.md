# AgentDeduct

AgentDeduct is a test app for real estate agents to track deductible business expenses, mileage, meal limits, and receipts before tax filing.

## Netlify Deploy

1. Log in to Netlify.
2. Go to **Add new site**.
3. Choose **Deploy manually**.
4. Drag the full `AgentDeduct` folder into Netlify.
5. Netlify will publish the app and give you a public test link.

## Tester Message

Send this to agents:

> I am testing AgentDeduct, a simple deduction tracker for real estate agents. Please add a few test expenses, upload a receipt, add mileage, export the CSV, and tell me what feels confusing or missing. This is a test tool only and is not tax advice.

## Current Test Limits

- Data saves only in each tester's browser/device.
- Receipt uploads stay local to the browser/device.
- The app owner cannot see agent data.
- Agents can export CSV reports, download a full JSON backup, or clear their test data.
- Image receipt auto-fill runs in the agent's browser with local OCR. Image receipts are compressed before saving to the browser record. The OCR library is loaded by the site, but the receipt image is not stored by the app owner.
- PDF receipts attach to the record but do not auto-fill fields in this test version.
- Anonymous activity tracking can count visits, users, saved expenses, receipt attachments, exports, downloads, print clicks, and OCR attempts/failures. It does not send expense amounts, mileage, vendors, receipt files, or tax records.
- There is no login yet.
- This is a recordkeeping estimate tool, not tax or legal advice.

## Private Activity Dashboard

After deploying to Netlify, add an environment variable:

- `AGENTDEDUCT_ADMIN_TOKEN`: choose a private token/password

Then open:

`https://your-netlify-site.netlify.app/admin.html`

The dashboard shows anonymous activity counts only.

## Google Sheets Testing Data

The testing data sheet is:

https://docs.google.com/spreadsheets/d/1R7pOjIfMaoQ_wOICFGNRHjdXP10zrJsD2Gt_cBKoTSM/edit

See `GOOGLE_SHEETS_SETUP.md` for the Apps Script webhook setup.

## Next Features

- Optional encrypted device backup
- Import from prior AgentDeduct backup
- Better receipt parsing after agent feedback
- CPA-ready PDF report
- Feedback form
