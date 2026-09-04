# Privacy Policy

**Effective date: [EFFECTIVE DATE]**
**Last updated: [EFFECTIVE DATE]**

> **This is not legal advice.** This Policy was prepared from a technical audit of the code that
> runs tovu.dev, so that it describes what this site actually does rather than what a template
> assumes. It is a starting point, not a finished legal instrument. A qualified lawyer in
> **[JURISDICTION]** should review it before you rely on it, and before it is published as the
> operative policy for a live business.

---

## Placeholders to fill before publishing

Every item below appears in square brackets in the text and **must** be replaced before this
document goes live. Nothing in this Policy is knowingly false, but these fields are blank rather
than guessed.

| Placeholder | What it needs |
|---|---|
| `[LEGAL ENTITY NAME]` | The registered legal entity that operates tovu.dev (sole trader, LLC, Ltd, etc.) |
| `[JURISDICTION]` | Country/state whose law governs, and where your lawyer practices |
| `[CONTACT EMAIL]` | A real, monitored mailbox for privacy requests. **Do not reuse the `support@example.com` placeholder currently shown on `/contact` — that address is not real.** |
| `[POSTAL ADDRESS]` | Registered postal address (GDPR Art. 13 requires an identifiable controller) |
| `[EFFECTIVE DATE]` | The date this version takes effect |
| `[HOSTING PROVIDER AND REGION]` | Who hosts tovu.dev and in which country/region the servers sit |
| `[EU REPRESENTATIVE]` | Required by GDPR Art. 27 if you are outside the EU and offer goods/services to, or monitor, people in the EU. Delete the section if you are established in the EU. |
| `[UK REPRESENTATIVE]` | Same, under UK GDPR Art. 27, if you are outside the UK. Delete if established in the UK. |
| `[LEAD SUPERVISORY AUTHORITY]` | e.g. the ICO (UK), or your EU lead authority |
| `[DPO CONTACT]` | Only if you have appointed a Data Protection Officer. **Delete this section entirely if you have not** — claiming a DPO you do not have is itself a misstatement. |
| `[BREACH NOTIFICATION TIMEFRAME]` | Your internal commitment for notifying affected people (statutory floor: 72 hours to the supervisory authority) |

### Operational items to confirm before publishing

These are not blanks in the text; they are facts this Policy asserts that depend on live
configuration rather than on code. Confirm each is true of the running deployment:

1. **`COMMENTS_IP_SALT` is set to a real secret** in the production environment. If it is unset,
   the code falls back to a published, hardcoded development salt and commenter IP hashes are
   reversible by anyone who reads the source. Comments are not in use today (0 stored), so this is
   a pre-condition for enabling them, not a current exposure.
2. **Global Privacy Control / Do Not Track honoring is switched on** in the analytics
   configuration. The code supports it; whether it is enabled is a settings value. §5.2 promises
   it, so enable it.
3. **A real mail credential (Resend or SMTP) is configured**, or is not. §7 names Resend as a
   processor conditionally; if you never configure a mailer, delete that row.
4. **`[HOSTING PROVIDER AND REGION]`** is answered. §11 cannot be completed without it.
5. **No third-party script beyond Google Fonts loads on the page.** This Policy was written from
   server-side code; if a theme or an error-reporting SDK loads another script in the browser, it
   must be added to §7.

---

## 1. The two things this Policy is about

Two very different things carry the name Tovu, and they have very different privacy consequences.
Keeping them apart is the single most important thing to understand here.

**tovu.dev — this website.** A website we run, that you are visiting right now. We decide what it
collects and we hold that data. This Policy describes it in full, in §3 through §14.

**Tovu — software you download and run yourself.** An application you install on infrastructure you
control. When you self-host Tovu, **you** are the data controller for your own site and its
visitors. The data your install collects lives in your database, on your servers. It is not sent to
us, and we cannot see it. §15 explains this properly, and what it means for your own obligations.

If you are reading this because you self-host Tovu and want to know what the software reports back
to us, skip to §15. The short answer is: nothing.

---

## 2. Who we are

**[LEGAL ENTITY NAME]** ("we", "us", "our") operates tovu.dev and is the **data controller** for
the personal data described in §3 to §14 of this Policy.

- Postal address: **[POSTAL ADDRESS]**
- Email for all privacy matters: **[CONTACT EMAIL]**
- Data Protection Officer: **[DPO CONTACT]** *(delete this line if no DPO has been appointed)*
- EU Article 27 representative: **[EU REPRESENTATIVE]** *(delete if established in the EU)*
- UK Article 27 representative: **[UK REPRESENTATIVE]** *(delete if established in the UK)*

This Policy is written to meet the UK GDPR, the EU GDPR, and the California Consumer Privacy Act as
amended by the California Privacy Rights Act (together, "CCPA"). Where those regimes use different
words for the same idea, we have tried to say both.

---

## 3. What tovu.dev collects

This section describes every category of personal data this site is capable of collecting, and
says plainly which of them are actually in use.

### 3.1 What we hold today

As of **[EFFECTIVE DATE]**, we verified directly against the live database what personal data this
site is actually holding:

| Category | Records held |
|---|---|
| Form submissions (contact and other site forms) | 13 |
| Registered member accounts | 0 |
| Analytics events | 0 |
| Newsletter subscriptions | 0 |
| Newsletter delivery records | 0 |
| Comments | 0 |
| Orders / payment records | 0 |
| Login sessions | 0 |
| Consent records | 0 |

We describe the other categories below anyway, because the software supports them and we may
switch them on. Where a feature is not currently active, we say so.

### 3.2 Forms (active)

The site has forms — a contact form, and any other form we publish. The fields on a form are
chosen by us when we build it; the platform supports short text, email addresses, long text, and
checkboxes.

When you submit a form we store:

- **The values you typed**, exactly as you typed them.
- **Your IP address, in full and unmodified.** We want to be direct about this, because it differs
  from how the rest of the site behaves: form submissions are the one place on tovu.dev where a
  raw, unhashed IP address is written to our database. We collect it to rate-limit submissions and
  to identify abuse. It is not truncated, not hashed, and not automatically deleted.
- The time of submission.

**Retention:** there is no automatic expiry on form submissions. They persist until we delete them.
A submission can be permanently and irreversibly deleted by us, one record at a time, from our
admin interface. Ask us and we will do it — see §9.

**Cookie:** if a submission fails validation, the site sets a short-lived `tovu_form_flash` cookie
so that your answers survive the page reload instead of being lost. It carries the text you just
typed, lasts **120 seconds**, is `HttpOnly` (unreadable by JavaScript), and is same-origin only.
Checkbox values are deliberately excluded from it. It exists only so the form still works with
JavaScript disabled.

**Spam trap:** forms include a hidden field that a human never sees or fills in. If it comes back
filled, the submission is treated as automated and discarded. Nothing about you is collected by
this mechanism.

### 3.3 Analytics (capability present; no events recorded)

If and when we enable analytics on this site, it is **our own, first-party analytics** — not Google
Analytics, not a third-party beacon, not an advertising pixel, and it sets **no cookie at all**.
This matters, so here is exactly what it does and does not do:

**It does not store your IP address or your browser's User-Agent string.** Not hashed-and-stored —
not stored. Before anything is written down, your IP is truncated to a coarse network block (the
last part of an IPv4 address is discarded; IPv6 is cut to a /48), combined with a broad device
class ("mobile", "Firefox") and a **salt that changes every day**, and run through a one-way hash.
The result is a single opaque value. The data structure the rest of the system receives has no
field for an IP address or a User-Agent, so they cannot leak downstream even by mistake.

**You cannot be followed from one day to the next.** Because the salt rotates daily, the same
visitor produces a completely different, unlinkable value tomorrow. Sessions are stitched together
only within a 30-minute window on the same day. There is no persistent visitor ID, no cookie, and
no cross-site identifier.

**We honor your browser's privacy signal.** If your browser sends Global Privacy Control (GPC) or
Do Not Track, we do not record the visit.

**Personal data is actively rejected, not just avoided.** Custom event properties are screened
before storage: property names that look like personal data (email, phone, ssn, and similar) and
values that look like email addresses are dropped rather than saved.

**What is actually stored:** a page path, a coarse device class, browser family and OS family, a
referring site's hostname, campaign tags if you arrived from a marketing link, an event name, and
the daily-rotating opaque value described above. There are no IP or User-Agent columns in the
table at all. Country and region fields exist but are always empty — we do not do geolocation
lookups.

We consider this data non-identifying in practice. We describe it here anyway, in the interest of
being complete rather than technically minimal.

### 3.4 Newsletter (capability present; no subscriptions)

**There is no "enter your email to subscribe" box on this site.** We want to be precise about this
because most privacy policies describe a signup flow, and ours does not exist. On tovu.dev today,
a newsletter subscription can only be created by us — from the admin interface, or by importing a
list. There is no public route that creates one.

If we do add you to a list, the following happens:

- Your subscription starts in a **pending** state and we email you a confirmation link. It becomes
  active only if you click it. In effect this is double opt-in.
- The subscription record itself **does not contain your email address**. It stores a reference to
  your identity record, the list, the status, and the dates. Your email lives in one place.
- The confirmation link's token is **never stored** — only a hash of it, with an expiry.
- **Unsubscribing** is a public, one-click, signed link. It needs no login, sets no cookie, and
  works however many times you click it.
- When we send you an email, we keep a delivery record containing your email address, the
  provider's message ID, and any delivery error. This is normal delivery bookkeeping.

**Retention:** unsubscribing changes the status of your subscription; it does not by itself erase
the record. We keep the record so that we do not accidentally re-add you and so we can show, if
challenged, that you were subscribed and then were not. If you want the underlying records erased,
ask us — §9.

### 3.5 Comments (capability present; not in use)

The platform can host comments on articles. No comment has ever been stored on this site. If we
turn comments on, this is what happens:

- Comments are anonymous — there is no login. We store the name you give, optionally an email
  address and a website, and your comment text.
- **Your IP address is never stored.** It is hashed with a secret salt at the moment the request
  arrives, and only the hash reaches storage.
- Spam filtering is **entirely local**. No third-party spam service is contacted. Your comment is
  not sent anywhere outside this site to be scored. (The code contains an unused adapter for a
  third-party service; it is not connected, and we would update this Policy before connecting it.)
- Comments move through pending, approved, spam, or trash. Trash is reversible. There is also a
  **permanent purge** that irreversibly destroys the record. Unlike some other data on this site,
  comment data genuinely can be erased.

### 3.6 Member accounts (capability present; no accounts)

The platform supports member accounts for gated content. No account has ever been created on this
site. If we enable them:

- **Sign-in is passwordless.** We email you a one-time link. There is no password, so there is no
  password to store, hash, or leak. There is no password anywhere in this system.
- We store your email address, optionally a name, whether the email has been verified, an account
  status, and an internal note field that is never shown to you or to anyone but us.
- **Sessions** store a hash of the session token (the token itself is never written down), the
  creation and expiry times, and — unlike the rest of the site — **your IP address and User-Agent
  in full**. These support session security: showing you your active sessions and detecting
  hijacking. The session cookie `tovu_member_session` is `HttpOnly` and `Secure`.
- **Consent** is recorded as a structured, purpose-by-purpose ledger: what you consented to, when,
  whether it was later withdrawn, and evidence of what you were shown at the time (including your
  IP and User-Agent at the moment of consent). Withdrawal is recorded as its own entry rather than
  erasing the original. This exists to prove consent was properly obtained, which is a legal
  requirement, and it is why consent records are the one category we do not delete on request.
- Member accounts are architecturally separate from our own administrative accounts. The two use
  different cookies, different tables, and different code paths, which cannot read each other.

**An important, unusual limitation you should know about:** member records in this software are
designed to be **disabled, never deleted**. A member is a first-class actor in the system's audit
history, and destroying the record would leave dangling references in that history. There is no
code path anywhere in the software that removes a member row. §10 explains exactly what we do
instead when you ask us to erase your data, and we would rather tell you the truth about this than
promise a delete button that does not exist.

### 3.7 Media and images

Images and files on this site are uploaded by us, not by visitors — there is no public upload form.

Where it is relevant to you: photographs can carry embedded metadata, including GPS coordinates and
camera details. Our image pipeline re-encodes images before serving them publicly, which does not
carry that metadata into the version you download. However, **the original uploaded file is stored
as received, with any metadata intact**, and we do not treat metadata stripping as a privacy
guarantee. If you send us an image — through a form, or by email — assume it still contains
whatever your camera or phone put into it.

### 3.8 Payments (not operational)

**No payment can currently be made on tovu.dev.** The only payment provider connected to this site
is a non-functional reference implementation that exists so the code can be tested; it has no
gateway behind it and no credentials. There are zero order records.

If we do connect a real payment processor:

- **Card details would never reach our database.** The order record has no field for a card number,
  a billing address, or a cardholder name. It stores only opaque references issued by the
  processor, plus an amount, currency, and status. This is structural, not a policy promise.
- **One caveat we want to state plainly:** when a payment processor notifies our server about an
  event, we store **that notification exactly as received**, as a complete record. Some processors
  include a customer name or email address in those messages. So while the structured order record
  holds no personal data, the stored notification could. We will name the processor and revise this
  section before enabling payments.

### 3.9 Server logs

Our application logs errors so we can fix them. These logs record the error itself, not your
request body, your IP address, or your email address. We should be honest that we have not audited
every possible error path: it is conceivable that in some circumstance an error message could
contain a fragment of something you typed. We do not use logs to build profiles, and we do not
share them.

---

## 4. What we do with all of this

| Why | What we use |
|---|---|
| Answering you when you contact us | Form submissions |
| Preventing spam and abuse, and rate-limiting | IP address on form submissions; hashed IP on comments |
| Keeping you logged in, if accounts are enabled | Session cookie, session records |
| Sending you email you asked for | Email address, subscription status |
| Understanding which pages are read, in aggregate | Non-identifying analytics events |
| Proving we obtained consent properly | Consent records |
| Meeting legal, tax, and accounting obligations | Whatever the applicable law requires |
| Security, and investigating incidents | Logs, session metadata, IP addresses |

**We do not** use your data for advertising, sell it, share it for cross-context behavioral
advertising, build advertising profiles, or make automated decisions that produce legal or
similarly significant effects about you. There is no profiling engine here.

---

## 5. Cookies

This is the complete list. There are three, and every one of them is strictly necessary.

| Cookie | Purpose | Set when | Lifetime | Flags |
|---|---|---|---|---|
| `tovu_session` | Keeps our own administrators logged in to the site's admin area | Only for us, never for visitors | Until the session expires | `HttpOnly`, `Secure`, `SameSite=Strict` |
| `tovu_member_session` | Keeps a signed-in member logged in | Only if member accounts are enabled and you sign in | Until the session expires | `HttpOnly`, `Secure`, `SameSite=Lax` |
| `tovu_form_flash` | Returns your own just-typed form answers to you after a validation error | Only after a failed form submission | **120 seconds** | `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS |

**There are no analytics cookies, no advertising cookies, no third-party cookies, and no
cross-site trackers on this site.** Our analytics sets no cookie at all (§3.3). This is why you do
not see a cookie consent banner: under the ePrivacy rules a banner is required for non-essential
storage, and we do not set any.

*Confirm before publishing: this list was derived from the site's server code. If a theme or an
embedded widget sets a cookie in the browser, it must be added here.*

---

## 6. Legal bases for processing (UK and EU GDPR)

| What we process | Legal basis |
|---|---|
| Form submissions, in order to reply to you | **Legitimate interests** (Art. 6(1)(f)) — responding to someone who has deliberately contacted us. Where the form is a step toward a contract, **contract** (Art. 6(1)(b)). |
| IP address for rate-limiting and abuse prevention | **Legitimate interests** (Art. 6(1)(f)) — keeping the site available and defending it against attack |
| Newsletter and marketing email | **Consent** (Art. 6(1)(a)), evidenced by the confirmation click. Withdrawable at any time via the unsubscribe link. |
| Member accounts and sessions | **Contract** (Art. 6(1)(b)) — providing the account you asked for |
| Non-identifying analytics | **Legitimate interests** (Art. 6(1)(f)). We consider the balance clearly favorable because no cookie is set, no IP is retained, and no cross-day identifier exists. |
| Consent records | **Legal obligation** (Art. 6(1)(c)) — the GDPR itself requires us to be able to demonstrate consent |
| Security logging and incident response | **Legitimate interests** (Art. 6(1)(f)) |
| Tax and accounting records, if payments are enabled | **Legal obligation** (Art. 6(1)(c)) |

We do not knowingly process special category data (Art. 9) — health, biometrics, political or
religious views, and so on. If you type something like that into a free-text form field, you are
doing so on your own initiative and you can ask us to delete it.

You may object to any processing we base on legitimate interests. See §9.

---

## 7. Third parties who may receive data

| Who | When | What they receive | Status |
|---|---|---|---|
| **Google (Google Fonts)** | **Every page load of this site** | **Your IP address and User-Agent** | **Active. This one applies to you right now.** See below. |
| **[HOSTING PROVIDER AND REGION]** | Continuously | Whatever passes through our servers | Active — fill in |
| **Resend** (email delivery) | When we send you email | Your email address and the message content | Only if we have configured it |
| An SMTP mail host of our choosing | Alternative to the above | Your email address and the message content | Only if configured instead of Resend |
| A payment processor | On a purchase | Payment details, which you would give directly to them | **Not enabled — see §3.8** |
| A third-party spam-filtering service | Never, currently | Nothing | **Not enabled — see §3.5** |

### 7.1 Google Fonts — please read this one

The typefaces this site uses are loaded from Google's font servers (`fonts.googleapis.com` and
`fonts.gstatic.com`) on **every page you view**. That request comes from your browser, which means
**your IP address and browser User-Agent are transmitted to Google every time you load a page
here**, before you have done anything at all.

We are disclosing this because it is true and because it has been the subject of GDPR enforcement
in Europe. We do not control what Google does with that request; their handling of it is governed
by Google's own privacy policy. Google is a US company, so this is also an international transfer
(§11).

If you would rather this did not happen, a browser extension that blocks third-party font requests
will prevent it, and the site will render in your system's default fonts. We consider self-hosting
the font files instead, which would remove this entirely.

### 7.2 Others

We may also disclose personal data to professional advisers (lawyers, accountants) under
confidentiality, and to law enforcement, courts, or regulators where we are legally required to.
If we are ever compelled to hand over your data, we will tell you unless we are legally forbidden
from doing so.

**We have never sold personal data and we do not intend to.**

---

## 8. How long we keep things

| Data | How long |
|---|---|
| Form submissions | Indefinitely — there is no automatic expiry. Deletable on request, permanently. |
| Comments | Indefinitely once approved. Permanently destroyable on request. |
| Newsletter subscriptions | Indefinitely, including after you unsubscribe (the status changes; the record stays) |
| Newsletter delivery records | Indefinitely |
| Member accounts | Indefinitely. **These cannot be destroyed** — see §10. |
| Member sessions | Until the session expires or is revoked |
| Consent records | Indefinitely, by design — this is the evidence that consent was obtained |
| Analytics events | Indefinitely, as non-identifying aggregate data |
| Order records and payment notifications | Indefinitely; also subject to statutory accounting retention if payments are enabled |

**A word about "delete" on this site.** Some deletions here are reversible (moving a comment to
trash) and some are final (purging a comment, deleting a form submission). Where a record is only
marked as removed rather than destroyed, the underlying row still exists in our database. We have
tried to be precise in the table above about which is which, rather than using "delete" to mean
both.

We do not currently operate a scheduled purge. If you would prefer a defined retention period —
"contact form submissions deleted after 24 months", for instance — that is a reasonable thing to
ask for and we will consider it.

---

## 9. Your rights

If the UK or EU GDPR applies to you, you have the right to:

- **Know and access** what personal data we hold about you and get a copy of it.
- **Correct** it if it is wrong or incomplete.
- **Erase** it, in the circumstances set out in Article 17. Please read §10, which explains
  precisely what we can and cannot destroy.
- **Restrict** how we process it, while a dispute about accuracy or legitimacy is resolved.
- **Object** to processing based on our legitimate interests, including any direct marketing. If
  you object to direct marketing, we will stop; there is no balancing test for that one.
- **Portability** — receive the data you gave us in a machine-readable format, where processing is
  based on consent or contract.
- **Withdraw consent** at any time, without affecting what we lawfully did before you withdrew it.
- **Not be subject to solely automated decision-making** with legal or similarly significant
  effects. We do not do this at all.

### How to exercise any of these

**Email [CONTACT EMAIL].** That is the whole mechanism, and we want to be straightforward about
why: this site does not have a self-service privacy dashboard, an export button, or a delete-my-
account button. Those do not exist in the software, and we are not going to describe features we
have not built. A person reads your email and acts on it.

Tell us what you want and enough information for us to find your records — the email address you
used, or the approximate date and content of a form submission. We may ask for more information if
we cannot identify you from what you send; we will not ask for more than we need.

**We will respond within one month.** If your request is genuinely complex we may extend that by up
to two further months, and we will tell you within the first month if we do. There is no charge,
unless a request is manifestly unfounded or excessive, in which case we may charge a reasonable fee
or decline — and explain why.

### If you are unhappy

Please tell us first, at **[CONTACT EMAIL]** — most problems are faster to fix directly.

You also have the right to complain to a data protection supervisory authority at any time, without
going through us. Ours is **[LEAD SUPERVISORY AUTHORITY]**. If you are in the EU or UK you may
complain to the authority where you live, where you work, or where you think the problem happened.
In the UK that is the Information Commissioner's Office (ico.org.uk). In the EU, a list of national
authorities is published by the European Data Protection Board.

---

## 10. Erasure — exactly how it works here

We are treating this as its own section because a truthful answer is more useful than a
reassuring one.

**How to ask:** email **[CONTACT EMAIL]** and say you want your data erased. A person handles it
manually. There is no self-service delete button on this site, and this Policy does not claim
there is one.

**What we will destroy, permanently and irreversibly:**

- Form submissions you have made, including the IP address stored with them.
- Comments you have posted, via the permanent purge function.

**What we can only anonymize or disable:**

- **Member accounts.** The software this site runs on cannot delete a member record. A member is
  a participant in the site's audit and revision history, and destroying the record would corrupt
  that history, so the capability was deliberately never built. What we will do instead, on
  request, is disable the account and overwrite the identifying fields on it — the email address,
  the name, and any custom fields — so that the remaining record no longer identifies you. We will
  tell you when it is done. If you want confirmation that a specific field has been cleared, ask
  and we will confirm it specifically.

**What we will keep, and why we are allowed to:**

- **Consent records**, where we need them to demonstrate that consent was properly obtained and
  later withdrawn. GDPR Article 17(3) permits retention where processing is necessary for
  compliance with a legal obligation or for establishing or defending legal claims. Deleting the
  proof that you consented would remove our ability to demonstrate we acted lawfully.
- **Records we are legally required to keep**, such as accounting records, for as long as the law
  requires.
- **Anonymized analytics events**, which contain no identifier that can be traced back to you and
  therefore are not personal data we could locate even if we wanted to.

**Backups.** If we hold backups, erasure applies to live systems immediately and to backups as
they age out of rotation, rather than by surgically editing backup archives. We do not restore
erased data from a backup into a live system.

---

## 11. International transfers

**Where this site is hosted: [HOSTING PROVIDER AND REGION].** This must be completed before the
Policy is published; it is a deployment fact, not something visible from the software.

The transfer we know about with certainty is **Google Fonts** (§7.1). Every page view sends your
IP address to Google, a US-headquartered company. Where personal data leaves the UK or EEA, the
lawful mechanisms are an adequacy decision, Standard Contractual Clauses, or a permitted
derogation. Google participates in the EU-US and UK-US Data Privacy Framework; whether that is
sufficient for your circumstances is exactly the kind of question to put to a lawyer, and it is one
more reason to consider self-hosting the fonts.

If we use an email provider (§7), that provider's location is also a transfer and should be named
here once configured.

For **self-hosted installs of Tovu**, data lives wherever the operator chooses to deploy. We have
no involvement in it and no visibility into it. See §15.

---

## 12. Children

This site is not directed at children, and we do not knowingly collect personal data from anyone
under 16 (or the applicable age of digital consent in your country, which is as low as 13 in some
member states).

**We should be plain about the mechanism: there is no age gate on this site.** There is no
date-of-birth field and no age verification anywhere, so we have no technical means of knowing
a visitor's age. What we rely on is that this is a site about content management software, with
nothing on it that is directed at or attractive to children.

If you believe a child has provided us with personal data, email **[CONTACT EMAIL]** and we will
delete it promptly.

---

## 13. Security

We would rather describe what is actually true than list reassuring adjectives.

**What the software does structurally:**

- **No passwords exist in this system.** Sign-in is by emailed one-time link. There is no password
  database to breach.
- **Session tokens are never stored.** Only a cryptographic hash of a token is written down, so
  our database contains nothing that could be replayed as a login.
- **Newsletter confirmation tokens are stored as hashes**, with an expiry, never in the clear.
- **Analytics discards personal data before storage**, by construction rather than by policy — the
  data structure that reaches storage has no field for an IP address or User-Agent.
- **Comment IP addresses are hashed** at the network boundary, before storage.
- **All cookies are `HttpOnly`**, so no JavaScript on the page can read them, and session cookies
  are `Secure` and `SameSite`-restricted.
- **Administrative access is permission-gated**, and deleting a visitor's data is a permission
  that must be explicitly granted. Member sessions and administrator sessions are architecturally
  isolated and cannot read one another.
- **Traffic is served over HTTPS.**

**What we are not claiming:** we do not hold a security certification, we have not commissioned a
third-party penetration test, and we do not offer a guarantee. No system is perfectly secure. If
you find a vulnerability, please tell us at **[CONTACT EMAIL]** rather than disclosing it publicly,
and we will work with you.

---

## 14. If something goes wrong

If a personal data breach occurs and it is likely to result in a risk to your rights and freedoms,
we will notify our supervisory authority within **72 hours** of becoming aware of it, as Article 33
requires.

If the breach is likely to result in a **high** risk to you, we will contact you directly, without
undue delay and within **[BREACH NOTIFICATION TIMEFRAME]**, and tell you what happened, what data
was involved, what we are doing about it, and what you can do to protect yourself.

Where CCPA applies, we will also comply with California's breach notification requirements.

---

## 15. Self-hosted Tovu — you are the controller

If you have downloaded Tovu and are running it yourself, this section is the one that concerns
you, and everything above is essentially irrelevant to your install.

**Your install does not send data to us.** Nothing in the software transmits your content, your
visitors' data, your configuration, or your usage back to any service we operate. Your database is
yours.

**You are the data controller for your site.** Every collection mechanism described in §3 —
forms, analytics, newsletter, comments, members, media — runs in *your* install, writes to *your*
database, and collects data about *your* visitors. You decide whether to enable each one and what
to do with what they collect. That makes you the controller. **You need your own privacy policy**
covering your own site, and you should not simply copy this one: it describes our configuration
and our choices, not yours.

**The AI assistant in the admin interface uses your own key.** Tovu's admin assistant is
bring-your-own-key. When you use it, the request goes from your install directly to the model
provider whose API key you supplied, under your own account and their terms. It does not route
through us and we do not supply the credential.

**Things to check in your own install**, because they materially affect your visitors' privacy:

- **Set a real, secret `COMMENTS_IP_SALT`.** If you leave it unset and enable comments, the
  software falls back to a publicly known development value, and your commenters' IP hashes become
  trivially reversible.
- **Your active theme may load Google Fonts.** If the theme's manifest declares web fonts, every
  page of your site sends your visitors' IP addresses to Google, exactly as described in §7.1. If
  you need to avoid that, self-host the font files.
- **Decide whether to honor Do Not Track and Global Privacy Control** in your analytics
  configuration. The software supports it; whether it is on is your setting.
- **Choose your own mail provider.** Email is sent through whatever provider you configure.
- **Member records cannot be deleted in your install either** (§10). If you take on members and
  they exercise erasure rights, plan for anonymization rather than deletion.

**[LEGAL ENTITY NAME] is not a processor for your install.** We do not receive, host, or process
your visitors' data, and there is nothing for us to sign a data processing agreement about. If you
need one from a hosting provider, that is a conversation with your host, not with us.

---

## 16. California residents (CCPA/CPRA)

If you are a California resident, this section applies to you in addition to everything above.

### What we collect, in California's categories

| CCPA category | Do we collect it? |
|---|---|
| Identifiers (name, email, IP address, account ID) | **Yes** — from forms; from member accounts if enabled |
| Personal information under Cal. Civ. Code §1798.80 (name, contact details) | **Yes** — from forms |
| Commercial information (purchases) | **No** — payments are not operational |
| Internet/network activity (browsing, interactions) | **Limited** — non-identifying analytics only; no IP or User-Agent retained |
| Geolocation data | **No** — we do not perform geolocation, and those database fields are always empty |
| Audio, video, biometric information | **No** |
| Employment or education information | **No** |
| Protected classifications (race, sex, age, and so on) | **No** — we do not ask |
| Sensitive personal information | **No** |
| Inferences drawn to create a profile | **No** — we build no profiles |

**Sources:** directly from you, and automatically from your browser when you visit.
**Business purposes:** replying to you, security and abuse prevention, sending email you asked
for, understanding aggregate readership, and legal compliance.
**Disclosures for a business purpose:** to our hosting provider, and to an email provider if
configured. Google receives your IP address as a technical consequence of font loading (§7.1).

### Do Not Sell or Share My Personal Information

**We do not sell your personal information, and we do not share it for cross-context behavioral
advertising**, as those terms are defined by the CCPA. We have never done so. We do not run
advertising and we do not have advertising partners.

Because there is nothing to opt out of, there is no "Do Not Sell or Share My Personal Information"
link on this site — such a link is required only of businesses that sell or share. If that ever
changes, we will add the link and update this Policy before any selling or sharing begins.

**Opt-out preference signals.** We honor **Global Privacy Control (GPC)**. If your browser sends
GPC, our analytics does not record your visit at all. We treat a GPC signal as a valid
do-not-sell-or-share request, even though we have nothing to sell.

**We do not use or disclose sensitive personal information** for any purpose beyond those permitted
by Cal. Civ. Code §1798.121(a), so the "Limit the Use of My Sensitive Personal Information" right
does not arise here.

### Your California rights

- **Right to know** what personal information we collect, use, disclose, and sell or share —
  including the specific pieces of information we hold about you.
- **Right to delete** the personal information we hold about you, subject to the exceptions in
  §1798.105(d). Please read §10 for exactly what we can destroy and what we can only anonymize.
- **Right to correct** inaccurate personal information.
- **Right to opt out** of sale or sharing. There is nothing to opt out of; see above.
- **Right to limit** the use of sensitive personal information. Not applicable; we collect none.
- **Right to non-discrimination.** We will never give you a worse service, a worse price, or a
  worse experience because you exercised a privacy right. We do not operate financial incentive
  programs.

**How to exercise them:** email **[CONTACT EMAIL]**. We will confirm receipt within **10 business
days** and respond substantively within **45 days**, extendable once by a further 45 days if we
tell you why.

**Verification.** We will ask you to verify your identity in a way proportionate to the sensitivity
of what you are asking for — usually by replying from the email address associated with the data.

**Authorized agents.** You may use an authorized agent. We will ask for written proof of the
agent's authority, and we may ask you to confirm directly that you authorized them.

**We have not sold or shared the personal information of any consumer, including minors under 16,
in the preceding twelve months.**

---

## 17. Other US state privacy laws

Several other states (Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana and others)
have enacted comprehensive privacy laws granting broadly similar rights: to know, access, correct,
delete, obtain a portable copy, and opt out of targeted advertising, sale, and profiling. If you
are a resident of such a state, contact us at **[CONTACT EMAIL]** and we will honor the equivalent
right. We do not conduct targeted advertising, sell personal data, or engage in profiling, so those
opt-outs have no subject matter here.

*A lawyer should confirm which of these statutes apply to you based on your revenue and data
volumes; most have thresholds you may fall well below.*

---

## 18. Changes to this Policy

We may update this Policy. When we do, we will change the "Last updated" date at the top.

If a change is **material** — a new category of data, a new third party, a new purpose, or anything
that meaningfully changes what happens to your data — we will say so prominently on this page, and
we will notify anyone we hold contact details for. Where a change requires your consent, we will
ask for it rather than assume it.

Previous versions are available on request.

---

## 19. Contact

| For | Contact |
|---|---|
| Anything about this Policy or your data | **[CONTACT EMAIL]** |
| Post | **[LEGAL ENTITY NAME]**, **[POSTAL ADDRESS]** |
| Data Protection Officer | **[DPO CONTACT]** *(delete if none appointed)* |
| EU representative | **[EU REPRESENTATIVE]** *(delete if established in the EU)* |
| UK representative | **[UK REPRESENTATIVE]** *(delete if established in the UK)* |
| Complaints to a regulator | **[LEAD SUPERVISORY AUTHORITY]** |

---

*This Policy was drafted from a technical audit of the source code and live database of tovu.dev,
so that the factual claims in it are verifiable rather than assumed. It has not been reviewed by a
lawyer. Have one in **[JURISDICTION]** review it before relying on it.*
