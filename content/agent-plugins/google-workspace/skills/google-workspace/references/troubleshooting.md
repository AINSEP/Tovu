# Troubleshooting Google Workspace

| Code | What happened | What to do |
|---|---|---|
| `not-connected` | No Google account is connected. | Connect Google Workspace. |
| `reconnect-required` | Google no longer accepts the saved sign-in (expired, revoked or the password changed). Undelivered form submissions are kept. | Reconnect with the same account, then retry once. |
| `account-changed` | The connection now uses another account than the one shown when the change was confirmed. | Review the account and confirm again. |
| `missing-permission` | The person did not allow a permission this needs. | Reconnect and allow every listed permission. |
| `file-not-granted` | Tovu cannot open this file with this account (often a pasted link, or the file was removed). | Choose the file again with the picker, or create a new spreadsheet. |
| `access-denied` | The account cannot edit this file. | Check sharing in Google Sheets, then pick it again. |
| `admin-policy` | A Google Workspace administrator blocks Tovu. | Ask the administrator to allow Tovu. |
| `quota-delay` | Google asked Tovu to slow down. | Wait (`retryAfterMs` says how long); nothing is lost. |
| `service-unavailable` / `network-error` | Google could not be reached. | Retry later. |
| `uncertain-outcome` | Google did not say whether a change was applied. | Ask the person to check the spreadsheet before retrying. Never repeat it automatically. |
| `invalid-request` | Google rejected the request (bad range, tab or values). | Fix the request. |
| `product-disabled` | The product is turned off. | Turn it on in the Google Workspace plugin. |

**"Disconnected locally; Google revocation pending"** means Tovu stopped using the account but Google
did not confirm removing access. Retry disconnect later, or remove Tovu at
https://myaccount.google.com/connections.
