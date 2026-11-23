# site-backup Overview

Exports, imports and share links for one website.

## Wiring: share link expiry (P11 ST-12a)

- `share-expiry.ts` — `shareExpiresAt({ days, now })` turns the owner's choice (Never, 7, 30 or
  90 days; Never is the default) into the `expiresAt` a new share records. `isShareExpired` is the
  one reading of that field: absent or null never expires (every older row and every peer-uploaded
  row); an unreadable value counts as expired, so damage can only stop a link, never extend it.
- `SiteShareRegistry` takes an injected clock (`{ now }`); `findToken` — and so the public
  `/_share/:token/:file` route — answers "no share" (404) once the share's own date has passed.
- Create path: admin `POST …/site-shares` body `{ expiresInDays?: 7 | 30 | 90 | null }` →
  `readShareInput` → `backend.create` (validated before any job starts) → `createSiteShare({ expiresAt })`.
  An expiry is refused for a link stored with a remote provider: only this server's route checks the
  date, so a remote copy would outlive it until ST-12b can delete it.
- Nothing is deleted or flipped here. The expiry pass that removes the ZIP (and later remote copies)
  under a per-share lock is ST-12b. The admin share screen does not offer the choice yet.
