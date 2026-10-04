# AgentDeduct Google Sheets Connection

Google Sheet:

https://docs.google.com/spreadsheets/d/1R7pOjIfMaoQ_wOICFGNRHjdXP10zrJsD2Gt_cBKoTSM/edit

## What Goes Into The Sheet

Usage Events:

- timestamp
- anonymous event name
- anonymous browser/device ID
- page
- device type
- app version
- user agent

Feedback:

- timestamp
- name, if user provides it
- email, if user provides it
- feedback type
- feedback message
- page
- anonymous browser/device ID
- user agent

The sheet does not receive receipt files, expense amounts, mileage values, vendors, categories, or tax records.

## Apps Script Setup

1. Open the Google Sheet above.
2. Go to **Extensions > Apps Script**.
3. Paste the code from `google-apps-script.js`.
4. Click **Deploy > New deployment**.
5. Choose **Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**.
8. Click **Deploy**.
9. Copy the Web app URL.
10. In Netlify, add this environment variable:

`GOOGLE_SHEETS_WEBHOOK_URL`

Set it to the Web app URL from Apps Script.

11. Redeploy AgentDeduct.

The webhook uses this private shared secret:

`[REDACTED - see Netlify env GOOGLE_SHEETS_WEBHOOK_SECRET]`

