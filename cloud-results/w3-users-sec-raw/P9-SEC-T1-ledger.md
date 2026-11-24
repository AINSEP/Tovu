# P9-SEC-T1 assertion ledger (deletion gate) — generated 2026-11-24 by worker O (security-cutover)

Source: `apps/admin/src/features/security` test files. File-level destinations from `plans/P9-SEC-plan-v2.md` §4 Test map.

**Status: every title is UNMAPPED at title level (no Jini/host destination title verified yet). A row without a destination blocks that file's deletion, so SEC-T1c deletion is BLOCKED.**

Host destinations landed by SEC-T0/T1a: `apps/admin/src/integrations/jini-admin/__tests__/security-ports.test.ts` (10 tests), `security-panel.test.tsx` (6 tests). Not yet covered there: TOTP enrol secret inside a private element; passkeys `navigator.credentials` absent and stubbed ceremony.

Files: 29; total `it(`/`test(` titles (static regex count, `it.each` rows counted once): 537.

## `__tests__/AccessTokensTab.credential-flows.unit.test.tsx` — 81 titles — plan destination: SEC-10/11/12 by section

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | renders and clears raw saved Works for ids for %s rows | UNMAPPED | — |
| 2 | selects Works for in a publish add form | UNMAPPED | — |
| 3 | selects Works for in the custom add dialog | UNMAPPED | — |
| 4 | renders migrated vault ids in every row control and passes the unchanged id to mutations | UNMAPPED | — |
| 5 | shows the loading placeholder until both tiers' groups resolve | UNMAPPED | — |
| 6 | shows the access-tokens load error and renders nothing else | UNMAPPED | — |
| 7 | shows the other-credentials load error even when access tokens loaded fine | UNMAPPED | — |
| 8 | clicking a category pill calls setCategory with that category's id | UNMAPPED | — |
| 9 | marks the active category tab aria-selected, and every other tab not selected | UNMAPPED | — |
| 10 | clicking '+ Add custom provider' opens the custom-credential dialog | UNMAPPED | — |
| 11 | the add-custom-provider dialog's accessible name comes from aria-labelledby pointing at its own <h2> | UNMAPPED | — |
| 12 | typing calls setQuery with the new value | UNMAPPED | — |
| 13 | shows the total-saved count line when no query is active | UNMAPPED | — |
| 14 | shows the matching-count line, summed across both tiers, when a query is active | UNMAPPED | — |
| 15 | hides a provider with zero rows whose own label/purpose does not match the query | UNMAPPED | — |
| 16 | still shows a provider with zero rows when the query matches its own label | UNMAPPED | — |
| 17 | shows a provider whose rows already matched the query upstream, even when its own label does not | UNMAPPED | — |
| 18 | shows 'Not connected' with a Connect button when a provider has no saved rows and no add form open | UNMAPPED | — |
| 19 | renders '[+ Add another]' for a connected catalog provider with its add form closed, and it calls openAddForm | UNMAPPED | — |
| 20 | never renders '[+ Add another]' for a custom credential group, connected or not | UNMAPPED | — |
| 21 | renders the add-token form instead of 'Not connected' once the add form is visible | UNMAPPED | — |
| 22 | hides 'Not connected' once the add form is open even with zero saved rows (no double affordance) | UNMAPPED | — |
| 23 | shows no default indicator or 'Make default' link when the provider has only one saved row | UNMAPPED | — |
| 24 | shows 'Default' as static text for the default row, and a working 'Make default' link on the other, once a provider has 2+ rows | UNMAPPED | — |
| 25 | REGRESSION: clicking 'Make default' calls makeDefault AND marks the click event defaultPrevented, the exact flag a real browser's <summary> checks before running its native toggle | UNMAPPED | — |
| 26 | disables Save until the replace form is ready (unchanged name, blank token) | UNMAPPED | — |
| 27 | clicking Save calls replaceToken with this row once a token has been typed | UNMAPPED | — |
| 28 | enables Save for a custom credential when ONLY its username changed, and Save calls replaceToken | UNMAPPED | — |
| 29 | enables Save for a custom credential whose saved username was CLEARED (blank draft, no token) | UNMAPPED | — |
| 30 | keeps Save disabled for a custom credential when nothing changed (same name, same username, no token) | UNMAPPED | — |
| 31 | keeps Save disabled for a Bitbucket row when ONLY the username field has text (catalog rule unchanged) | UNMAPPED | — |
| 32 | shows 'Saving…' and disables Save while a save is in flight | UNMAPPED | — |
| 33 | shows the row's own save-error alert when present | UNMAPPED | — |
| 34 | shows no alert when the row has no error | UNMAPPED | — |
| 35 | typing into Name/Token calls setExistingField for this row | UNMAPPED | — |
| 36 | typing into Account ID calls setExistingField for this row (Cloudflare Pages' own required field) | UNMAPPED | — |
| 37 | typing into Username calls setExistingField for this row (a field Bitbucket's descriptor declares) | UNMAPPED | — |
| 38 | clicking Remove from Tovu opens the confirm dialog | UNMAPPED | — |
| 39 | gives each saved row's Save and Remove buttons DISTINCT accessible names when a provider has 2+ tokens | UNMAPPED | — |
| 40 | the confirm dialog's accessible name comes from aria-labelledby pointing at its own <h2> | UNMAPPED | — |
| 41 | typing into Name calls setAddField with this provider's ref | UNMAPPED | — |
| 42 | disables Save until ready, and clicking Save (once ready) calls createToken with this provider's ref | UNMAPPED | — |
| 43 | disables Save while the add form has nothing typed yet | UNMAPPED | — |
| 44 | clicking Cancel calls closeAddForm with this provider's ref | UNMAPPED | — |
| 45 | shows the add-form's own save-error alert when present | UNMAPPED | — |
| 46 | shows 'Saving…' and disables Save while a create is in flight | UNMAPPED | — |
| 47 | masks the catalog %s token and suppresses saved-login autofill | UNMAPPED | — |
| 48 | shows Account ID for Cloudflare Pages (a required field) and calls setAddField when typed into | UNMAPPED | — |
| 49 | does not show Account ID for a provider that doesn't require it | UNMAPPED | — |
| 50 | shows a declared Username field with its descriptor's person-facing help, and calls setAddField when typed into | UNMAPPED | — |
| 51 | shows Username with generic optional-field hint copy for a custom credential's Replace form (optionalFields, not required) | UNMAPPED | — |
| 52 | typing into the Access token field calls onTokenChange (setAddField) | UNMAPPED | — |
| 53 | Cancel closes the dialog without calling removeToken | UNMAPPED | — |
| 54 | confirming calls removeToken with this row and closes the dialog | UNMAPPED | — |
| 55 | shows the last-saved-row note only when this is the only saved row for the provider | UNMAPPED | — |
| 56 | omits the last-saved-row note when the provider has more than one saved row | UNMAPPED | — |
| 57 | typing into each field calls setCustomAddField with just that field | UNMAPPED | — |
| 58 | shows an inline error for an invalid, non-blank base URL | UNMAPPED | — |
| 59 | shows no base-URL error while the field is still blank | UNMAPPED | — |
| 60 | shows no base-URL error for a valid, non-blank URL | UNMAPPED | — |
| 61 | shows an inline error for an invalid additional-hosts entry | UNMAPPED | — |
| 62 | toggles the access token field between masked and visible | UNMAPPED | — |
| 63 | disables Save until the form is ready, and clicking Save (once ready) calls createCustomCredential | UNMAPPED | — |
| 64 | disables Save while the form has nothing typed yet | UNMAPPED | — |
| 65 | closes the dialog on a successful save | UNMAPPED | — |
| 66 | does NOT close the dialog when save fails (createCustomCredential resolves false) | UNMAPPED | — |
| 67 | clicking Cancel closes the dialog and calls resetCustomAddForm | UNMAPPED | — |
| 68 | shows the dialog's own save-error alert when present | UNMAPPED | — |
| 69 | shows 'Saving…' and disables Save while a save is in flight | UNMAPPED | — |
| 70 | renders $badge and dispatches $action without toggling the row | UNMAPPED | — |
| 71 | warns before Replace that $usedBy switch to the new token | UNMAPPED | — |
| 72 | does not warn when only this site uses the project key | UNMAPPED | — |
| 73 | labels a site-only key without offering an attachment action | UNMAPPED | — |
| 74 | disables a pending attachment and shows its failure in the visible summary | UNMAPPED | — |
| 75 | saves to Shared Keys without offering a site ciphertext copy | UNMAPPED | — |
| 76 | offers only site storage when no project store is available | UNMAPPED | — |
| 77 | settles the real %s hook's load failure in the page | UNMAPPED | — |
| 78 | forwards a custom row's username edits for both its saved row and its add form | UNMAPPED | — |
| 79 | renders an optional secret extra field as a password input marked optional, with no hint when it has no help | UNMAPPED | — |
| 80 | explains that an unlisted provider's saved tokens can still be removed | UNMAPPED | — |
| 81 | lists a saved Tier 2 credential alongside the providers | UNMAPPED | — |

## `__tests__/AccessTokensTab.hooks.unit.test.tsx` — 12 titles — plan destination: SEC-10

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | ranks a configured external-mcp entry above an unconfigured media-provider placeholder | UNMAPPED | — |
| 2 | ranks a configured Tier-2 entry above an unconnected Tier-1 provider in an earlier-ranked category | UNMAPPED | — |
| 3 | still ranks a saved Tier-1 token above an unconfigured Tier-2 placeholder (round 1's own baseline, now cross-tier) | UNMAPPED | — |
| 4 | explodes a store with 2+ configured items into one entry per item, ranked by its own item name | UNMAPPED | — |
| 5 | renders exactly one placeholder entry per otherwise-empty store, never zero and never more than one | UNMAPPED | — |
| 6 | hides an empty Tier-2 store whose own label/purpose does not match the query | UNMAPPED | — |
| 7 | still shows an empty Tier-2 store when the query matches its own label | UNMAPPED | — |
| 8 | shows a Tier-2 store whose row already matched the query upstream, even if the store's own label does not | UNMAPPED | — |
| 9 | hides an unconnected Tier-1 provider whose own label does not match the query | UNMAPPED | — |
| 10 | returns only the query-matched entries across both tiers, still filled-before-unfilled | UNMAPPED | — |
| 11 | returns an empty list while both controllers' groups are undefined | UNMAPPED | — |
| 12 | keeps the loaded controller visible while %s groups are loading | UNMAPPED | — |

## `__tests__/AccessTokensTab.unit.test.tsx` — 13 titles — plan destination: SEC-9

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | links to Plugins when the Hosting filter has no providers | UNMAPPED | — |
| 2 | saves and clears Works for with the token and required account fields left blank | UNMAPPED | — |
| 3 | renders the autocomplete=off attribute guard on the search field | UNMAPPED | — |
| 4 | labels the secret input exactly '$label' | UNMAPPED | — |
| 5 | clears the mounted Account ID input after saving a replacement token | UNMAPPED | — |
| 6 | shows the existing Not connected copy for an empty %s category | UNMAPPED | — |
| 7 | renders the entry and lists copy sources only when opened | UNMAPPED | — |
| 8 | moves focus and calls setCategory on the next category on ArrowRight | UNMAPPED | — |
| 9 | moves focus to the last category on End | UNMAPPED | — |
| 10 | moves focus from %s with %s to %s, including wraparound | UNMAPPED | — |
| 11 | gives only the active category a roving tabindex of 0, and leaves the Add custom provider button untouched | UNMAPPED | — |
| 12 | ignores an arrow key pressed on the non-tab Add custom provider button inside the tablist | UNMAPPED | — |
| 13 | renders the entry and opens the copy dialog, which lists the copy sources | UNMAPPED | — |

## `__tests__/CopyKeysDialog.unit.test.tsx` — 3 titles — plan destination: SEC-12

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | approves one Shared Keys reference without source-site or overwrite controls | UNMAPPED | — |
| 2 | shows omitted saved keys for each source | UNMAPPED | — |
| 3 | explains how to enter a new key when Shared Keys is empty | UNMAPPED | — |

## `__tests__/OtherCredentialsSection.unit.test.tsx` — 18 titles — plan destination: SEC-13

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | renders the 'Not configured' placeholder and its deep link when row is undefined | UNMAPPED | — |
| 2 | renders a configured item under its own item name, not the store's generic label | UNMAPPED | — |
| 3 | gives two entries for the same store DISTINCT Remove-button accessible names, by row name | UNMAPPED | — |
| 4 | a store that supports Replace renders the disabled masked-value field (OtherCredentialReplaceableRow) | UNMAPPED | — |
| 5 | a store that does NOT support Replace renders just the value fact and a direct Remove (OtherCredentialStaticRow) | UNMAPPED | — |
| 6 | ${storeId}: Remove opens a confirm dialog and does NOT call controller.remove on the first click | UNMAPPED | — |
| 7 | ${storeId}: Cancel closes the dialog without calling controller.remove | UNMAPPED | — |
| 8 | ${storeId}: confirming calls controller.remove exactly once, with this row | UNMAPPED | — |
| 9 | shows the saved timestamp only when updatedAt is set | UNMAPPED | — |
| 10 | shows a visible alert with the row's own error text when present | UNMAPPED | — |
| 11 | shows the saved timestamp in the field label only when updatedAt is set | UNMAPPED | — |
| 12 | shows a visible alert with the row's own error text when present | UNMAPPED | — |
| 13 | the confirm dialog body for a replaceable store is the shared 'does NOT revoke' copy, unchanged | UNMAPPED | — |
| 14 | clicking Remove opens the confirm dialog, and Cancel closes it without calling controller.remove | UNMAPPED | — |
| 15 | confirming the dialog calls controller.remove(row) with this row | UNMAPPED | — |
| 16 | the confirm dialog's accessible name comes from aria-labelledby pointing at its own <h2> | UNMAPPED | — |
| 17 | publishes opaque item ids under safe handles without altering draft or mutation keys | UNMAPPED | — |
| 18 | renders an external-mcp row whose raw item id is not handle-safe (contains an underscore), without throwing | UNMAPPED | — |

## `__tests__/RecoveryCodesCard.unit.test.tsx` — 8 titles — plan destination: SEC-3

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | uses the current password for proof and new-password for the desktop reset, even when revealed | UNMAPPED | — |
| 2 | hides recovery actions from staff | UNMAPPED | — |
| 3 | shows a new kit once and clears the password after issue | UNMAPPED | — |
| 4 | keeps the status store failure and offers copyable details | UNMAPPED | — |
| 5 | preserves the server explanation when %s fails | UNMAPPED | — |
| 6 | translates recovery controls with the page translator | UNMAPPED | — |
| 7 | does not read recovery status again when only the page language changes | UNMAPPED | — |
| 8 | includes the enrolled owner authenticator proof when rotating the recovery kit | UNMAPPED | — |

## `__tests__/Security.unit.test.tsx` — 12 titles — plan destination: SEC-1 + host security-panel.test.tsx (SEC-T0)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | keeps the recovery status visible through the page translator | UNMAPPED | — |
| 2 | renders a page header (Operations kicker, Secrets title) above a TabBar | UNMAPPED | — |
| 3 | renders the AccessTokensTab body underneath, not just the tab bar | UNMAPPED | — |
| 4 | handleTabChange navigates to the clicked tab's own URL, replacing history | UNMAPPED | — |
| 5 | C3: publishes the site-key handle and navigates to the site-key tab URL | UNMAPPED | — |
| 6 | C3: a retired bookmark falls back to Access Tokens even for a site-key manager | UNMAPPED | — |
| 7 | shows the Site key tab and its panel for a principal WITH the permission | UNMAPPED | — |
| 8 | publishes the localized site-key tab label without the hidden Generate action | UNMAPPED | — |
| 9 | hides the Site key tab entirely for a principal WITHOUT the permission | UNMAPPED | — |
| 10 | resolves a direct ?tab=site-key link to Access Tokens for a principal WITHOUT the permission, rendering neither the tab nor its panel | UNMAPPED | — |
| 11 | still resolves an absent or unrecognized ?tab= value to Access Tokens regardless of permission | UNMAPPED | — |
| 12 | reads the viewer's permissions from /auth/me and offers the Site key tab to a site-key manager | UNMAPPED | — |

## `__tests__/SiteKeyRecoveryCard.unit.test.tsx` — 2 titles — plan destination: SEC-7

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | blocks empty and busy unlock attempts and renders the server's unlock error | UNMAPPED | — |
| 2 | shows the preview loading and busy confirmation states without permitting a destructive click | UNMAPPED | — |

## `__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx` — 5 titles — plan destination: SEC-6

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | does not reveal a site key by clicking either published ancestor | UNMAPPED | — |
| 2 | does not publish the Reveal button to the agent | UNMAPPED | — |
| 3 | does not publish the revealed value or its Copy control | UNMAPPED | — |
| 4 | keeps the revealed value out of everything the page driver reports, ancestors included | UNMAPPED | — |
| 5 | still shows the revealed value to the human | UNMAPPED | — |

## `__tests__/SiteKeyTab.unit.test.tsx` — 28 titles — plan destination: SEC-5 / SEC-6

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | labels the section "Site key" with the canonical terminology | UNMAPPED | — |
| 2 | renders the fingerprint label beside the active key's fingerprint | UNMAPPED | — |
| 3 | keeps the scope notice's plain-language explanation of what the key protects | UNMAPPED | — |
| 4 | says a key is created automatically, not that Generating one would save it | UNMAPPED | — |
| 5 | does not offer Reveal when no key is active | UNMAPPED | — |
| 6 | marks an invalid key as a warning | UNMAPPED | — |
| 7 | hides Generate even when there is no key at all — site-key plan §A.6: kept but hidden by default | UNMAPPED | — |
| 8 | hides Generate when the existing key file is invalid — Generate can only create, never replace it | UNMAPPED | — |
| 9 | hides Generate when an invalid env var is already active — that source always wins regardless of validity | UNMAPPED | — |
| 10 | tells the operator honestly that this tab can't replace an invalid key file yet, instead of promising a control that isn't there | UNMAPPED | — |
| 11 | offers both actions when the site's credentials are locked | UNMAPPED | — |
| 12 | does not show the card when the key is fine | UNMAPPED | — |
| 13 | the confirm step shows the preview sentence and keeps Start fresh disabled until the phrase is typed | UNMAPPED | — |
| 14 | forwards the typed token and Unlock and Start fresh actions | UNMAPPED | — |
| 15 | forwards the confirmation text, enables Start fresh when allowed, and wires Cancel | UNMAPPED | — |
| 16 | the pasted token field is a password field hidden from the assistant | UNMAPPED | — |
| 17 | keeps the card up with the result sentence after recovery, even once the status is active again | UNMAPPED | — |
| 18 | missing-with-data: says the credentials need their original site key, not that a key is created at startup | UNMAPPED | — |
| 19 | mismatch: shows the same line | UNMAPPED | — |
| 20 | a plain missing key keeps the startup line | UNMAPPED | — |
| 21 | shows a status read failure instead of the cards | UNMAPPED | — |
| 22 | explains an active key set on the server, not in a file | UNMAPPED | — |
| 23 | reveals on click, shows the in-flight label disabled, and surfaces a reveal failure | UNMAPPED | — |
| 24 | copies the revealed value to the clipboard and confirms it | UNMAPPED | — |
| 25 | wires the real site-key controller by default and shows the status the server returns | UNMAPPED | — |
| 26 | renders nothing until a status has loaded, or once any key source exists | UNMAPPED | — |
| 27 | generates on click when there is no key, and shows the in-flight label disabled | UNMAPPED | — |
| 28 | explains each generate failure kind in its own words | UNMAPPED | — |

## `__tests__/access-token-providers.fixture.ts` — 0 titles — plan destination: SEC-10 (fixture)

| # | title | destination (file + title) | landed by |
|---|---|---|---|

## `__tests__/access-tokens-revoke-copy.unit.test.tsx` — 1 titles — plan destination: SEC-10

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | names GitHub (the vendor) as where to revoke a GitHub Pages token, not GitHub Pages (the destination) | UNMAPPED | — |

## `__tests__/copy-keys.fixture.ts` — 0 titles — plan destination: SEC-12 (fixture)

| # | title | destination (file + title) | landed by |
|---|---|---|---|

## `__tests__/rules.unit.test.ts` — 139 titles — plan destination: SEC-9 (+10/11)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | leaves the generic token label to the view when a host declares only non-token fields | UNMAPPED | — |
| 2 | lists every deploy host that takes a credential, in registry order, then the listed source-control hosts | UNMAPPED | — |
| 3 | skips a host whose descriptor takes no credential | UNMAPPED | — |
| 4 | lists only the source-control hosts while the deploy hosts are still loading, and none of either before both load | UNMAPPED | — |
| 5 | reads a source-control host's token label, token page and guidance from its plugin descriptor, and never names GitLab or Bitbucket itself | UNMAPPED | — |
| 6 | reads a host's token label, token page, guidance and vendor from its descriptor | UNMAPPED | — |
| 7 | shows a credential's person-facing userHelp as its guidance over the agent's help | UNMAPPED | — |
| 8 | falls back to the host's own label as its vendor, and to no token page or guidance, when the descriptor names none | UNMAPPED | — |
| 9 | gives an unlisted provider a bare entry named by its own id, never another provider's copy | UNMAPPED | — |
| 10 | gives github-pages and github distinct purpose labels — the two-store GitHub trap | UNMAPPED | — |
| 11 | carries cloudflare-pages' Account ID field and a source-control host's declared Username field through as extra fields | UNMAPPED | — |
| 12 | preserves server token metadata for a %s row without changing its identity | UNMAPPED | — |
| 13 | uses the saved label verbatim as the display name when it is not the legacy sentinel | UNMAPPED | — |
| 14 | computes a friendly name for a lone legacy 'default'-labeled row | UNMAPPED | — |
| 15 | numbers a second legacy row for the SAME provider distinctly from the first | UNMAPPED | — |
| 16 | names a chat-saved 'default-<id>' project row like the sentinel row, keeping the raw label | UNMAPPED | — |
| 17 | numbers legacy rows independently per provider, not globally | UNMAPPED | — |
| 18 | uses the source-control sentinel (not the publish one) for source-control rows | UNMAPPED | — |
| 19 | ACCESS_TOKEN_CATEGORIES starts with All, then the five owner-specified buckets, then General | UNMAPPED | — |
| 20 | every Tier 1 provider lands in exactly one non-'all' category | UNMAPPED | — |
| 21 | every Tier 2 store lands in exactly one non-'all' category | UNMAPPED | — |
| 22 | accessTokenCategoryMatches: 'all' matches every row category | UNMAPPED | — |
| 23 | accessTokenCategoryMatches: a specific filter matches only its own bucket | UNMAPPED | — |
| 24 | lists all four Tier 2 stores, in the documented order | UNMAPPED | — |
| 25 | links media provider credentials to the Media screen's External Providers tab | UNMAPPED | — |
| 26 | marks external-mcp as NOT supporting inline Replace | UNMAPPED | — |
| 27 | marks the three single-apiKey stores as supporting inline Replace | UNMAPPED | — |
| 28 | falls back to the first store for an unknown id — same defensive-fallback guarantee as accessTokenProviderInfo | UNMAPPED | — |
| 29 | matches everything when the query is blank | UNMAPPED | — |
| 30 | matches on the store's own label | UNMAPPED | — |
| 31 | matches on the store's purpose subtitle | UNMAPPED | — |
| 32 | matches on a configured item's own name when given | UNMAPPED | — |
| 33 | does not match an unrelated query | UNMAPPED | — |
| 34 | maskedTailFact adds the bullet prefix to a bare tail | UNMAPPED | — |
| 35 | envNamesFact singularizes exactly one variable | UNMAPPED | — |
| 36 | envNamesFact pluralizes two or more variables | UNMAPPED | — |
| 37 | envNamesFact reports zero as a fact, not blank | UNMAPPED | — |
| 38 | stays byte-identical in English for the empty-query, zero-count case | UNMAPPED | — |
| 39 | stays byte-identical in English for the empty-query singular case | UNMAPPED | — |
| 40 | stays byte-identical in English for a searched, plural-total case | UNMAPPED | — |
| 41 | stays byte-identical in English for a searched, singular-total case | UNMAPPED | — |
| 42 | ignores leading/trailing whitespace in the query the same way the old check did | UNMAPPED | — |
| 43 | renders a full translated German sentence, not glued fragments | UNMAPPED | — |
| 44 | renders a full translated Japanese sentence with the query reordered to the front | UNMAPPED | — |
| 45 | resolves a known catalog id to its human label | UNMAPPED | — |
| 46 | falls back to the raw id for a provider the catalog no longer lists | UNMAPPED | — |
| 47 | filters to exactly one kind+providerId pair, ignoring the same providerId under a different kind | UNMAPPED | — |
| 48 | puts every group with at least one saved row before every group with none, regardless of input order | UNMAPPED | — |
| 49 | orders the saved tier by category in the same order as the filter chips: source control, hosting, media, ai, ops, general | UNMAPPED | — |
| 50 | orders the unsaved tier by the same category order, independently of the saved tier | UNMAPPED | — |
| 51 | sorts alphabetically by label within the same tier and category, locale-aware/case-insensitive | UNMAPPED | — |
| 52 | a provider moving from zero saved rows to one moves it into the saved tier on the next call | UNMAPPED | — |
| 53 | a filtered/searched subset (fewer groups, possibly one category only) still sorts by the same rule | UNMAPPED | — |
| 54 | custom providers follow the same category-based rule as catalog providers | UNMAPPED | — |
| 55 | does not mutate the input array | UNMAPPED | — |
| 56 | matches everything when the query is blank | UNMAPPED | — |
| 57 | matches on the provider's own label, case-insensitively | UNMAPPED | — |
| 58 | matches on the purpose subtitle — the two-store GitHub disambiguator | UNMAPPED | — |
| 59 | matches on the row's own display name | UNMAPPED | — |
| 60 | does not match an unrelated query | UNMAPPED | — |
| 61 | flags a collision, case- and whitespace-insensitive | UNMAPPED | — |
| 62 | does not flag a different name | UNMAPPED | — |
| 63 | does not flag a row against itself when excludeId is passed — editing a row's own name is not a collision | UNMAPPED | — |
| 64 | does not flag a same-name row under a DIFFERENT provider — uniqueness is per (kind, providerId) | UNMAPPED | — |
| 65 | is not ready with a blank name, even with a token typed | UNMAPPED | — |
| 66 | is not ready with a blank token, even with a name typed | UNMAPPED | — |
| 67 | is ready once both are filled, for a provider needing no extra field | UNMAPPED | — |
| 68 | stays not-ready for cloudflare-pages until Account ID is also filled | UNMAPPED | — |
| 69 | is not ready with everything blank — nothing to send | UNMAPPED | — |
| 70 | is ready for a rename-only save: new name, blank token | UNMAPPED | — |
| 71 | is NOT ready when the name is unchanged and the token is blank — no diff to send | UNMAPPED | — |
| 72 | is ready when a new site key is typed, name unchanged, for a provider needing no extra field | UNMAPPED | — |
| 73 | requires cloudflare-pages' accountId whenever a NEW token is typed, even on replace | UNMAPPED | — |
| 74 | uses the default token field for a publish provider with no credential spec | UNMAPPED | — |
| 75 | dispatches to the publish builder for a publish ref | UNMAPPED | — |
| 76 | dispatches to the source-control builder for a source-control ref | UNMAPPED | — |
| 77 | sends a label-only patch when only the name changed | UNMAPPED | — |
| 78 | sends a connection-only patch when only the token changed | UNMAPPED | — |
| 79 | sends both when both changed | UNMAPPED | — |
| 80 | recognizes a legacy duplicate marker in the message when the code is absent | UNMAPPED | — |
| 81 | uses the validation message when no string detail exists in %j | UNMAPPED | — |
| 82 | classifies a DUPLICATE_LABEL ApiError | UNMAPPED | — |
| 83 | classifies a VALIDATION ApiError, preferring body.detail over the message | UNMAPPED | — |
| 84 | falls back to generic for a non-ApiError | UNMAPPED | — |
| 85 | falls back to generic for an ApiError whose code matches neither known marker | UNMAPPED | — |
| 86 | accepts http and https URLs | UNMAPPED | — |
| 87 | rejects a non-http(s) scheme | UNMAPPED | — |
| 88 | rejects a malformed string | UNMAPPED | — |
| 89 | resolves every real category id to its own label | UNMAPPED | — |
| 90 | preserves a short-token hint without adding a username or exposing token bytes | UNMAPPED | — |
| 91 | maps a raw summary onto an AccessTokenRow with kind 'custom' and no default | UNMAPPED | — |
| 92 | gives each row its OWN providerId (its own id) — no shared grouping key across two custom rows | UNMAPPED | — |
| 93 | uses General and no token-page URL for a custom row without optional category or URL metadata | UNMAPPED | — |
| 94 | delegates straight through for a catalog kind | UNMAPPED | — |
| 95 | builds a synthetic info for a 'custom' row from its own name/category/baseUrl | UNMAPPED | — |
| 96 | marks a custom credential as custom, so one named 'github' never reads as the GitHub source-control group | UNMAPPED | — |
| 97 | 'Custom credential' is translated in every admin locale | UNMAPPED | — |
| 98 | keeps a host's declared order: fields before its token field render above it, the rest below | UNMAPPED | — |
| 99 | puts every extra field below the token when the token is declared first, or the provider declares no order | UNMAPPED | — |
| 100 | providerGroupHandleLabel names the provider and reports the connected count | UNMAPPED | — |
| 101 | providerGroupHandleLabel reports zero connected the same way as any other count | UNMAPPED | — |
| 102 | tokenRowHandleLabel joins the row's own name and its provider's label | UNMAPPED | — |
| 103 | is ready once name, a valid base URL, and a token are all present | UNMAPPED | — |
| 104 | is not ready with a blank name | UNMAPPED | — |
| 105 | is not ready with a blank token | UNMAPPED | — |
| 106 | is not ready with an invalid base URL | UNMAPPED | — |
| 107 | never requires a username — it stays optional | UNMAPPED | — |
| 108 | is ready with a valid additionalHosts entry | UNMAPPED | — |
| 109 | is not ready when an additionalHosts entry is not a valid http(s) URL | UNMAPPED | — |
| 110 | stays optional — a blank additionalHosts field never blocks save | UNMAPPED | — |
| 111 | splits on newlines, trims, and drops blank entries | UNMAPPED | — |
| 112 | also splits on commas, so a pasted comma-separated list works the same way | UNMAPPED | — |
| 113 | returns an empty array for a blank or whitespace-only field | UNMAPPED | — |
| 114 | returns an empty array when every entry is a valid http(s) URL | UNMAPPED | — |
| 115 | returns exactly the entries that fail isValidHttpUrl, leaving valid ones out | UNMAPPED | — |
| 116 | is empty for a blank field — this field is entirely optional | UNMAPPED | — |
| 117 | returns the parsed array when at least one entry is present | UNMAPPED | — |
| 118 | returns undefined for a blank field, so the create/update call omits it entirely | UNMAPPED | — |
| 119 | is workspace-wide, unlike accessTokenNameTaken — two DIFFERENT custom rows (different providerId) still collide | UNMAPPED | — |
| 120 | is case-insensitive and whitespace-trimmed, same as accessTokenNameTaken | UNMAPPED | — |
| 121 | excludes the row being renamed via excludeId | UNMAPPED | — |
| 122 | never matches a catalog (non-'custom') row sharing the same name | UNMAPPED | — |
| 123 | includes a non-blank username | UNMAPPED | — |
| 124 | omits a blank username entirely, never sends an empty string | UNMAPPED | — |
| 125 | is not ready with everything blank/unchanged — nothing to send | UNMAPPED | — |
| 126 | is ready for a rename-only save, same as the shared catalog gate | UNMAPPED | — |
| 127 | is ready for a USERNAME-ONLY save — the exact case the shared catalog gate cannot allow | UNMAPPED | — |
| 128 | is ready for clearing a saved username alone (typed blank, was previously set) | UNMAPPED | — |
| 129 | is ready whenever a new site key is typed, regardless of name/username | UNMAPPED | — |
| 130 | treats an undefined saved username the same as an empty one (a row that never had one) | UNMAPPED | — |
| 131 | a custom row uses the custom gate: a username-only change is ready | UNMAPPED | — |
| 132 | a catalog row keeps the catalog gate: a username with no token and no rename is NOT ready | UNMAPPED | — |
| 133 | sends a username-only patch when only the username changed, no token typed | UNMAPPED | — |
| 134 | sends `username: null` — never `\ | UNMAPPED | — |
| 135 | omits `username` entirely when it did not change | UNMAPPED | — |
| 136 | includes `username` alongside `connection` when both changed together, matching the server's own top-level-wins precedence | UNMAPPED | — |
| 137 | sends label, connection, and username together when all three changed | UNMAPPED | — |
| 138 | appends one bare unlisted entry per unlisted provider that has saved rows, named by its id | UNMAPPED | — |
| 139 | adds nothing for listed providers or custom rows | UNMAPPED | — |

## `__tests__/security-i18n.unit.test.ts` — 18 titles — plan destination: relocate with host security-i18n.ts (import line only)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | includes the failure detail in the selected language | UNMAPPED | — |
| 2 | uses English generation copy for %s | UNMAPPED | — |
| 3 | matches the Media screen and tab labels in %s | UNMAPPED | — |
| 4 | falls back to the English label for an unrecognized locale | UNMAPPED | — |
| 5 | translates for ${locale} | UNMAPPED | — |
| 6 | falls back to the English copy for an unrecognized locale | UNMAPPED | — |
| 7 | falls back to the English templates | UNMAPPED | — |
| 8 | shows copied success with the server's four-character hint | UNMAPPED | — |
| 9 | shows copied success without the invalid hint %s | UNMAPPED | — |
| 10 | shows the target-exists reason for a skipped copy | UNMAPPED | — |
| 11 | shows the generic failure for an unknown copy reason | UNMAPPED | — |
| 12 | shows the generic failure when a failed copy omits its reason | UNMAPPED | — |
| 13 | warns that external MCP removal cannot be undone in %s | UNMAPPED | — |
| 14 | warns that removing a media token does not revoke it | UNMAPPED | — |
| 15 | has translated site key copy in ${locale} | UNMAPPED | — |
| 16 | names the key in German and Spanish | UNMAPPED | — |
| 17 | translates every usage string in %s | UNMAPPED | — |
| 18 | counts only the other sites in the replace warning | UNMAPPED | — |

## `__tests__/security-visuals.unit.test.tsx` — 1 titles — plan destination: relocate with host security-visuals.tsx (import line only)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | keeps %s decorative and respects default and explicit dimensions | UNMAPPED | — |

## `__tests__/site-key-copy.i18n.unit.test.tsx` — 2 titles — plan destination: host translator test or SEC-5 (ledger decides)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | supplies the tab disclosure, status, reveal and accessibility copy in ${locale} | UNMAPPED | — |
| 2 | renders the German file-key disclosure and Reveal control without advertising hidden Generate | UNMAPPED | — |

## `__tests__/site-key-generate-error.unit.test.ts` — 7 titles — plan destination: SEC-5

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | KEY_DEPENDENT_DATA → 'locked', carrying the server's own words | UNMAPPED | — |
| 2 | KEY_MISMATCH → 'locked' | UNMAPPED | — |
| 3 | KEY_INVALID and SITE_META_UNREADABLE → 'refused', carrying the server's own words | UNMAPPED | — |
| 4 | ALREADY_EXISTS (a production race) → 'already-exists' | UNMAPPED | — |
| 5 | ENV_VAR_ACTIVE is no longer a known code → 'generic' | UNMAPPED | — |
| 6 | a non-ApiError → 'generic' | UNMAPPED | — |
| 7 | classifies a null rejection as a generic failure with the unknown-error fallback | UNMAPPED | — |

## `__tests__/site-key-status.rules.unit.test.ts` — 5 titles — plan destination: SEC-5

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | labels an inactive %s key as None | UNMAPPED | — |
| 2 | renders the server's actual env name | UNMAPPED | — |
| 3 | uses the standard environment name when the server omits it | UNMAPPED | — |
| 4 | labels an active file key without using environment provenance | UNMAPPED | — |
| 5 | interpolates the German badge | UNMAPPED | — |

## `__tests__/use-security-permissions.unit.test.tsx` — 1 titles — plan destination: SEC-1 + host security-ports.test.ts

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | denies while loading and evaluates %j after settlement | UNMAPPED | — |

## `__tests__/use-site-key-recovery.unit.test.ts` — 12 titles — plan destination: SEC-7

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | is true for missing-with-data and mismatch, or after generate was refused as locked | UNMAPPED | — |
| 2 | unlocks with the pasted token, clears it from state, reports the result and refreshes the tab | UNMAPPED | — |
| 3 | shows the server's sentence when the token doesn't open anything, and keeps the input | UNMAPPED | — |
| 4 | does nothing for an empty paste | UNMAPPED | — |
| 5 | clears an earlier preview and shows the shared error when a new preview fails | UNMAPPED | — |
| 6 | finishes recovery without a refresh callback | UNMAPPED | — |
| 7 | ignores a second unlock while the first token is being imported | UNMAPPED | — |
| 8 | disables confirmation while starting fresh and ignores repeat confirmation | UNMAPPED | — |
| 9 | reports completion without receiver-update instructions when no webhooks were affected | UNMAPPED | — |
| 10 | loads the preview first, confirms only on the exact phrase, then names the affected webhooks | UNMAPPED | — |
| 11 | shows the server's sentence when start fresh is refused, and keeps the confirm step open | UNMAPPED | — |
| 12 | cancel closes the confirm step and clears the typed phrase | UNMAPPED | — |

## `__tests__/use-site-key.unit.test.tsx` — 12 titles — plan destination: SEC-6

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | the wired controller loads the real API port and binds its translator to the saved locale | UNMAPPED | — |
| 2 | a failed refresh reports the load failure and keeps the earlier revealed key | UNMAPPED | — |
| 3 | loads status once on mount and reveals the exact hex only on request; hide clears it | UNMAPPED | — |
| 4 | does not reveal before status loads or when no key is active | UNMAPPED | — |
| 5 | an active key with no revealed hex stays hidden | UNMAPPED | — |
| 6 | ignores another reveal while the first reveal is pending | UNMAPPED | — |
| 7 | ignores generation before status loads and while a generation is pending | UNMAPPED | — |
| 8 | reports status and reveal failures without staying busy or exposing a key | UNMAPPED | — |
| 9 | generate replaces missing status with the returned key metadata, without revealing it | UNMAPPED | — |
| 10 | classifies generate refusal %s and refresh clears it | UNMAPPED | — |
| 11 | refresh re-reads status and clears an earlier revealed hex | UNMAPPED | — |
| 12 | writes the exact revealed hex and resets Copied after the display interval | UNMAPPED | — |

## `hooks/__tests__/access-tokens-dependencies.unit.test.ts` — 22 titles — plan destination: SEC-8 / SEC-9

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | forwards works-for metadata edits and clears without a connection | UNMAPPED | — |
| 2 | list delegates to api.listPublishCredentials, returning the snapshot unchanged | UNMAPPED | — |
| 3 | create forwards input to api.createPublishCredential and unwraps the { credential } envelope | UNMAPPED | — |
| 4 | update forwards id + input to api.updatePublishCredential and unwraps the envelope | UNMAPPED | — |
| 5 | remove forwards id to api.deletePublishCredential | UNMAPPED | — |
| 6 | list delegates to api.getPublishTargets, returning the hosts unchanged | UNMAPPED | — |
| 7 | the fake lists no hosts unless a test stubs some | UNMAPPED | — |
| 8 | a publishTargets override wins over the fake's empty default | UNMAPPED | — |
| 9 | list delegates to api.listSourceControlProviders and returns just the listed hosts | UNMAPPED | — |
| 10 | the fake lists no hosts unless a test stubs some | UNMAPPED | — |
| 11 | list delegates to api.listSourceControlCredentials, returning the snapshot unchanged | UNMAPPED | — |
| 12 | create forwards input to api.createSourceControlCredential and unwraps the envelope | UNMAPPED | — |
| 13 | update forwards id + input to api.updateSourceControlCredential and unwraps the envelope | UNMAPPED | — |
| 14 | remove forwards id to api.deleteSourceControlCredential | UNMAPPED | — |
| 15 | list delegates to api.listCustomCredentials, returning the snapshot unchanged | UNMAPPED | — |
| 16 | create forwards input to api.createCustomCredential and unwraps the envelope | UNMAPPED | — |
| 17 | update forwards id + input to api.updateCustomCredential and unwraps the envelope | UNMAPPED | — |
| 18 | remove forwards id to api.deleteCustomCredential | UNMAPPED | — |
| 19 | every list defaults to an empty snapshot, never a fabricated row | UNMAPPED | — |
| 20 | every unstubbed create/update rejects with a named 'not stubbed for this test' error | UNMAPPED | — |
| 21 | every unstubbed remove resolves (a safe idempotent default), never throwing | UNMAPPED | — |
| 22 | an override wins over its group's default for all three groups | UNMAPPED | — |

## `hooks/__tests__/other-credentials-dependencies.unit.test.ts` — 13 titles — plan destination: SEC-13

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | getSiteAssistantCredential delegates to api.getAssistantSiteCredential and returns its result unchanged | UNMAPPED | — |
| 2 | setSiteAssistantCredential forwards the patch to api.setAssistantSiteCredential | UNMAPPED | — |
| 3 | deleteSiteAssistantCredential delegates to api.deleteAssistantSiteCredential | UNMAPPED | — |
| 4 | getAdminByokCredential delegates to api.getAdminExecutionCredential | UNMAPPED | — |
| 5 | setAdminByokCredential forwards the patch to api.setAdminExecutionCredential | UNMAPPED | — |
| 6 | deleteAdminByokCredential delegates to api.deleteAdminExecutionCredential | UNMAPPED | — |
| 7 | getMediaProviders delegates to api.getMediaProviders | UNMAPPED | — |
| 8 | saveMediaProviders forwards the whole map to api.saveMediaProviders | UNMAPPED | — |
| 9 | listExternalMcpServers delegates to api.listExternalMcpServers | UNMAPPED | — |
| 10 | deleteExternalMcpServer forwards the server id to api.deleteExternalMcpServer | UNMAPPED | — |
| 11 | every store defaults to the honest empty/unconfigured GET, never a fabricated connected one | UNMAPPED | — |
| 12 | every unstubbed write rejects with a named 'not stubbed for this test' error, never silently resolving | UNMAPPED | — |
| 13 | an override wins over its store's default for every one of the four stores | UNMAPPED | — |

## `hooks/__tests__/security-permissions-dependencies.unit.test.tsx` — 2 titles — plan destination: host security-ports.test.ts (/auth/me grants)

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | keeps site-key management unavailable until the wired auth request returns its permission | UNMAPPED | — |
| 2 | forwards auth errors instead of manufacturing permissions | UNMAPPED | — |

## `hooks/__tests__/site-key-dependencies.unit.test.ts` — 2 titles — plan destination: SEC-4

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | %s forwards the exact request and returned data | UNMAPPED | — |
| 2 | preserves the API refusal when importing a token, then permits a retry | UNMAPPED | — |

## `hooks/__tests__/use-access-tokens.unit.test.tsx` — 84 titles — plan destination: SEC-9/11/12/14 by section

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | creates a $expected key when project storage is $available and selection is $selected | UNMAPPED | — |
| 2 | refreshes usage after attaching and detaching, retaining the key and other sites; duplicate clicks write once | UNMAPPED | — |
| 3 | keeps the usage facts on a failed write and permits a retry | UNMAPPED | — |
| 4 | reports a failed metadata refresh after the attachment was saved | UNMAPPED | — |
| 5 | retains attachment facts when a metadata-only update omits them | UNMAPPED | — |
| 6 | sends the explicit selection when creating a %s credential | UNMAPPED | — |
| 7 | prefills the %s label %s and respects an explicit clear | UNMAPPED | — |
| 8 | does not prefill the non-exact label %s | UNMAPPED | — |
| 9 | edits and clears %s compatibility without re-entering a token | UNMAPPED | — |
| 10 | preserves unknown %s ids during an unrelated rename | UNMAPPED | — |
| 11 | retains all three confirmed store inventories when their seed queries refresh later | UNMAPPED | — |
| 12 | sends nothing for a %s replacement that was never edited, keeping the saved row's prefill | UNMAPPED | — |
| 13 | rejects an invalid %s replacement and clears the error when its draft is corrected | UNMAPPED | — |
| 14 | rejects an invalid token in the provider add form before creating a credential | UNMAPPED | — |
| 15 | rejects an invalid custom-provider token without clearing the dialog's draft | UNMAPPED | — |
| 16 | typing into Token before Name does not clear the saved Name | UNMAPPED | — |
| 17 | a SECOND edit on the same row merges onto its own already-created draft, not the persisted-row fallback | UNMAPPED | — |
| 18 | seeds a blank name/username when the edited row id has no persisted row to fall back to (a stale or since-removed row id), proven via replaceToken's own write payload | UNMAPPED | — |
| 19 | a rejected remove surfaces a visible per-row error instead of failing silently | UNMAPPED | — |
| 20 | a rejected update surfaces a visible per-row error instead of failing silently | UNMAPPED | — |
| 21 | a saved custom credential's edit draft prefills its saved username | UNMAPPED | — |
| 22 | a saved custom credential with no username still prefills empty, not stale or blank-by-accident | UNMAPPED | — |
| 23 | saving a changed Username with NO token typed sends a username-only PUT, and never touches connection/label | UNMAPPED | — |
| 24 | clearing a saved Username with no token typed sends the server's `null` clear sentinel, not a blank string | UNMAPPED | — |
| 25 | does nothing (no API call) when nothing was actually changed — same 'no diff to send' rule as name-only replace | UNMAPPED | — |
| 26 | re-reads all three stores when a content refresh fires, so an assistant-written credential shows up without a reload | UNMAPPED | — |
| 27 | refreshes on a notification that names access-tokens, and ignores one that names only other resources | UNMAPPED | — |
| 28 | stops re-reading once unmounted | UNMAPPED | — |
| 29 | a background reload keeps the publish and source-control inventories it could not re-read, while applying the custom one | UNMAPPED | — |
| 30 | a rejected background reload surfaces a visible load error instead of failing silently | UNMAPPED | — |
| 31 | clears a stale initial-load error once a background reload succeeds, instead of masking the success forever (claim a) | UNMAPPED | — |
| 32 | keeps the other two stores' fresh reload data when only one store's reload rejects, instead of Promise.all discarding all three (claim b) | UNMAPPED | — |
| 33 | discards an older in-flight reload's result once a newer reload has already landed, instead of overwriting fresher data (claim c) | UNMAPPED | — |
| 34 | returns a referentially stable t across re-renders when locale does not change, so reloadAllStores's useCallback (and its content-refresh subscription) is not rebuilt every render | UNMAPPED | — |
| 35 | surfaces a rejected PUBLISH list as the load error on first load | UNMAPPED | — |
| 36 | surfaces a rejected SOURCE-CONTROL list as the load error when publish succeeds | UNMAPPED | — |
| 37 | surfaces a rejected CUSTOM list as the load error when the other two stores succeed | UNMAPPED | — |
| 38 | openAddForm makes exactly that provider's add form visible, leaving every other provider's form untouched | UNMAPPED | — |
| 39 | setAddField merges into that provider's own draft, not any other provider's | UNMAPPED | — |
| 40 | closeAddForm resets that provider's form back to blank and invisible | UNMAPPED | — |
| 41 | does nothing (no API call) when the form is not ready to save (blank name) | UNMAPPED | — |
| 42 | rejects with a visible duplicate-name error, with no API call, when the name collides with an already-saved row for the same provider | UNMAPPED | — |
| 43 | creates a new PUBLISH credential and merges it into that provider's rows (mergeCredential's publish branch) | UNMAPPED | — |
| 44 | creates a new SOURCE-CONTROL credential and merges it into that provider's rows (mergeCredential's source-control branch) | UNMAPPED | — |
| 45 | a rejected create with a plain Error surfaces the generic save-error message (accessTokenSubmitErrorMessage's generic branch) | UNMAPPED | — |
| 46 | a server-detected duplicate label (race with another tab/session) surfaces the same duplicate-name message as the client precheck (accessTokenSubmitErrorMessage's duplicate-label branch) | UNMAPPED | — |
| 47 | a server VALIDATION rejection surfaces the server's own detail text, not a generic message (accessTokenSubmitErrorMessage's validation branch) | UNMAPPED | — |
| 48 | does nothing (no API call) when the replace form is not ready to save (blank name) | UNMAPPED | — |
| 49 | rejects with a visible duplicate-name error, with no API call, when renaming to another saved row's name for the same provider | UNMAPPED | — |
| 50 | renames and rotates a PUBLISH row's token, merging the server's result (mergeCredential's publish branch) | UNMAPPED | — |
| 51 | leaves every OTHER saved row for the same provider unchanged when replacing one of several (mergeRaw's own no-match pass-through) | UNMAPPED | — |
| 52 | renames a SOURCE-CONTROL row, merging the server's result (mergeCredential's source-control branch) | UNMAPPED | — |
| 53 | rotates a PUBLISH token without sending an unchanged label | UNMAPPED | — |
| 54 | a rejected replace surfaces the save-error message on that row (accessTokenSubmitErrorMessage via replaceToken's catch) | UNMAPPED | — |
| 55 | evaluates row.username's own '' fallback when the row has never been given one, with no prior draft (replaceCustomCredential's not-yet-drafted row shape) | UNMAPPED | — |
| 56 | rejects with a visible duplicate-name error, with no API call, when renaming to another saved custom credential's name | UNMAPPED | — |
| 57 | a rejected custom update surfaces the save-error message on that row | UNMAPPED | — |
| 58 | removing a CUSTOM row calls port.custom.remove then re-reads the custom store | UNMAPPED | — |
| 59 | removing a PUBLISH row calls port.publish.remove then re-fetches the publish store | UNMAPPED | — |
| 60 | removing a SOURCE-CONTROL row calls port.sourceControl.remove then re-fetches the source-control store (refetchStore's else branch) | UNMAPPED | — |
| 61 | does nothing (no API call) when the row is already the default | UNMAPPED | — |
| 62 | makes a non-default row the default, then re-fetches the store (refetchStore's publish branch) | UNMAPPED | — |
| 63 | a promotion that landed shows the new default even when the reconcile refetch after it fails | UNMAPPED | — |
| 64 | a source-control promotion that landed shows the new default even when the reconcile refetch after it fails | UNMAPPED | — |
| 65 | setCustomAddField merges into the draft without touching other fields | UNMAPPED | — |
| 66 | resetCustomAddForm clears every field back to blank and clears busy/error state | UNMAPPED | — |
| 67 | returns false and makes no API call when the form is not ready to save (invalid base URL) | UNMAPPED | — |
| 68 | rejects with a visible workspace-wide duplicate-name error, with no API call | UNMAPPED | — |
| 69 | creates a new custom credential, appends it, resets the form, and returns true | UNMAPPED | — |
| 70 | a rejected create surfaces the save-error message and returns false | UNMAPPED | — |
| 71 | can promote a %s credential before its initial inventory has settled | UNMAPPED | — |
| 72 | reports zero counts while loading, then counts both saved credentials after the lists resolve | UNMAPPED | — |
| 73 | createToken evaluates the addForms-not-yet-created fallback and exits via readyToSave when nothing was ever typed | UNMAPPED | — |
| 74 | createToken proceeds through accessTokenNameTaken's rows-not-yet-loaded fallback and mergeCredential's publish-not-yet-seeded fallback | UNMAPPED | — |
| 75 | createToken proceeds the same way for a SOURCE-CONTROL provider (mergeCredential's source-control-not-yet-seeded fallback) | UNMAPPED | — |
| 76 | createCustomCredential proceeds through customCredentialNameTaken's and the custom-store's own not-yet-loaded fallbacks | UNMAPPED | — |
| 77 | replaceToken (publish) proceeds through accessTokenNameTaken's rows-not-yet-loaded fallback when a draft already exists for a row this hook has never actually loaded | UNMAPPED | — |
| 78 | replaceCustomCredential proceeds through customCredentialNameTaken's and the custom-store's own not-yet-loaded fallbacks | UNMAPPED | — |
| 79 | evaluates row.username's fallback safely for a real row (username always undefined for a non-custom kind), without an API call since nothing changed | UNMAPPED | — |
| 80 | evaluates row.username's fallback safely for a hand-built row that already carries one — a shape today's UI never produces for a non-custom kind, but the field is not discriminated by kind at the type level, and the code's own comment documents keeping this fallback for a future provider that does | UNMAPPED | — |
| 81 | wires the real port and locale — reads settle through the mocked lib/api | UNMAPPED | — |
| 82 | keeps a saved publish row for a switched-off host visible, under a fallback group marked unlisted, and it can still be removed | UNMAPPED | — |
| 83 | keeps a saved source-control row whose provider is not listed visible, marked unlisted | UNMAPPED | — |
| 84 | marks no listed provider as unlisted | UNMAPPED | — |

## `hooks/__tests__/use-copy-keys.unit.test.tsx` — 6 titles — plan destination: SEC-12

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | selects one reference and never submits a site identity or a copy overwrite | UNMAPPED | — |
| 2 | ignores a forged selection not offered by Shared Keys | UNMAPPED | — |
| 3 | locks cancellation and duplicate submission while approval is pending | UNMAPPED | — |
| 4 | shows an actionable redacted failure and clears it on reopen | UNMAPPED | — |
| 5 | does not render another site inventory returned by an older host | UNMAPPED | — |
| 6 | a locked site key shows why and cannot be approved; a usable site key reads as just its name | UNMAPPED | — |

## `hooks/__tests__/use-other-credentials.unit.test.tsx` — 28 titles — plan destination: SEC-13

| # | title | destination (file + title) | landed by |
|---|---|---|---|
| 1 | recreates a media provider removed elsewhere using its new key without stale settings | UNMAPPED | — |
| 2 | prefers media token metadata to a legacy mask and still shows a configured key with no metadata | UNMAPPED | — |
| 3 | omits built-in MCP servers and chooses access-token, environment-token, then environment-name facts | UNMAPPED | — |
| 4 | rejects an invalid replacement token and clears the error when the draft is corrected | UNMAPPED | — |
| 5 | shows a failed remove on a row with no draft using a blank token | UNMAPPED | — |
| 6 | uses the same localized server hint for both BYOK stores without adding mask bullets | UNMAPPED | — |
| 7 | settles each store independently into its own row(s), covering every reader and readStore's dispatch | UNMAPPED | — |
| 8 | a rejected store read reports its own loadError with the exact banner text, without blocking the other three stores | UNMAPPED | — |
| 9 | category='ai' includes only ai-category stores (site-assistant/admin-byok/external-mcp), excluding media/ops | UNMAPPED | — |
| 10 | matchCount only counts items whose name matches the query, independent of totalCount | UNMAPPED | — |
| 11 | stores the typed value, defaulting saving/error for a row with no prior draft | UNMAPPED | — |
| 12 | does nothing when the draft token is empty | UNMAPPED | — |
| 13 | does nothing for a store that does not support Replace, even with a token typed | UNMAPPED | — |
| 14 | shows a set single-key store with no server hint as a bare mask | UNMAPPED | — |
| 15 | writes nothing for an external-mcp row even if it were offered Replace | UNMAPPED | — |
| 16 | site-assistant: writes via setSiteAssistantCredential, refetches, and clears the draft on success | UNMAPPED | — |
| 17 | admin-byok: writes via setAdminByokCredential | UNMAPPED | — |
| 18 | media-provider: rebuilds the WHOLE map — target gets the new key, every other provider is preserved as {} | UNMAPPED | — |
| 19 | media-provider: a Replace carries baseUrl/model through for the target AND every other provider | UNMAPPED | — |
| 20 | a rejected write surfaces the exact save-error text and preserves the typed (untrimmed-source) token | UNMAPPED | — |
| 21 | site-assistant: deleteSiteAssistantCredential, then refetches | UNMAPPED | — |
| 22 | admin-byok: deleteAdminByokCredential | UNMAPPED | — |
| 23 | media-provider: rebuilds the map WITHOUT the removed provider, preserving every other provider as {} | UNMAPPED | — |
| 24 | media-provider: removing one provider carries every OTHER provider's baseUrl/model through unchanged | UNMAPPED | — |
| 25 | external-mcp: deleteExternalMcpServer(itemId) | UNMAPPED | — |
| 26 | a rejected remove surfaces the exact error text and preserves whatever draft token already existed | UNMAPPED | — |
| 27 | a second media-provider remove reads the map only AFTER the first one's write landed | UNMAPPED | — |
| 28 | wires the real port and locale — reads settle through the mocked lib/api | UNMAPPED | — |

