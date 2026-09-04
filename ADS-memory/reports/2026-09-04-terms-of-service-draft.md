# Terms of Service

**Effective date: [EFFECTIVE DATE]**
**Last updated: [EFFECTIVE DATE]**

> **This is not legal advice.** These Terms were prepared from a technical audit of tovu.dev and
> the Tovu software, so that they describe what actually exists rather than what a template
> assumes. They are a starting point, not a finished legal instrument. A qualified lawyer in
> **[JURISDICTION]** should review them before you rely on them — in particular the liability,
> warranty, licensing, and governing-law sections, which are the ones that decide what happens if
> something goes badly wrong.

---

## Placeholders to fill before publishing

| Placeholder | What it needs |
|---|---|
| `[LEGAL ENTITY NAME]` | The registered legal entity that publishes Tovu and operates tovu.dev |
| `[JURISDICTION]` | Country/state whose law governs these Terms, and where your lawyer practices |
| `[GOVERNING LAW]` | The body of law chosen — often the same as `[JURISDICTION]` but state it explicitly |
| `[VENUE]` | The courts that will hear a dispute |
| `[CONTACT EMAIL]` | A real, monitored mailbox. **Do not reuse the `support@example.com` placeholder currently shown on `/contact` — that address is not real.** |
| `[POSTAL ADDRESS]` | Registered postal address for legal notices |
| `[EFFECTIVE DATE]` | The date this version takes effect |
| `[SOFTWARE LICENSE]` | **See §4.1 — this is the most urgent gap.** The license under which the downloadable software is offered. |
| `[LIABILITY CAP]` | The monetary ceiling in §13. Note that where nothing has been paid, the cap needs to be a stated figure, not "the amount you paid". |
| `[TRADEMARK LIST]` | The names and marks you claim, and whether any are registered |
| `[NOTICE PERIOD]` | How much notice you give before a material change to these Terms takes effect |

### The one that blocks publication

**There is no `LICENSE` file in the Tovu repository, and no `license` field in its package
manifest.** That means that as things stand, the downloadable software is offered with **no
express grant of rights at all**. Under default copyright law, that is not "free to use" — it is
"all rights reserved", and a person who downloads it, runs it, and modifies it has no clear licence
to do so.

Section 4 below cannot be truthfully completed until you decide this. Pick a licence (MIT, Apache
2.0, AGPL, a proprietary source-available licence, or a commercial one), commit a `LICENSE` file to
the repository, and then fill in `[SOFTWARE LICENSE]`. **A lawyer's input here is worth more than
anywhere else in this document**, because the choice determines whether anyone can build a business
on Tovu, whether their modifications must be published, and whether you can later change your mind.

---

## 1. What these Terms cover

These Terms of Service are an agreement between you and **[LEGAL ENTITY NAME]** ("we", "us",
"our"). They cover two distinct things, and it matters which one you are dealing with:

**(a) The website at tovu.dev** — reading it, browsing it, using its forms, subscribing to
anything on it, and any account you hold on it. Call this **the Site**.

**(b) The Tovu software** — the application you can download and install on infrastructure you
control. Call this **the Software**.

They are governed by the same Terms but have very different consequences. Sections 2 and 3 are
about the Site. Sections 4 to 8 are about the Software. Sections 9 onward apply to both.

**What these Terms do not cover:** we do not currently operate a hosted, paid Tovu service. If we
launch one, it will have its own terms, and this document will be updated before it does.

---

## 2. Accepting these Terms, and changes to them

By using the Site or the Software you agree to these Terms. If you do not agree, do not use them.

We may change these Terms. When we do, we will update the "Last updated" date. For **material**
changes — anything that meaningfully alters your rights or obligations — we will post notice on
this page at least **[NOTICE PERIOD]** before the change takes effect. Continuing to use the Site
or the Software after a change takes effect means you accept it. If you do not accept a change,
stop using the Site and stop using the Software.

**Changes to these Terms do not retroactively change the licence under which you already obtained
a copy of the Software.** Whatever licence applied to the version you downloaded continues to apply
to that copy.

---

## 3. Using the Site

### 3.1 Who may use it

You must be old enough to form a binding contract where you live, and at least 16, or the age of
digital consent in your country if that is lower. The Site is not directed at children. There is no
age gate, so we rely on you here.

### 3.2 Acceptable use

Do not:

- Break the law, or use the Site to help someone else break it.
- Attempt to gain unauthorized access to the Site, its admin interface, its database, its
  underlying infrastructure, or anyone else's account.
- Probe, scan, or test the Site's security without our prior written permission. If you want to
  test it, ask — see §3.4.
- Overwhelm the Site: no denial-of-service, no flooding, no scraping at a rate that degrades
  service for others, and no circumventing our rate limits.
- Submit anything through a form that is unlawful, defamatory, harassing, infringing, malicious, or
  that contains malware.
- Submit anyone else's personal data without a lawful basis for doing so.
- Impersonate anyone, or misrepresent your affiliation with any person or organization.
- Use automated means to create accounts or submit content, or evade our spam controls.
- Strip, obscure, or alter any copyright, trademark, or attribution notice.

We may remove content, block access, or restrict use of the Site at any time if we reasonably
believe you have breached this section. We do not have to warn you first, though usually we will.

### 3.3 Anything you submit to the Site

If you submit content to the Site — a form, a comment, feedback, or anything else — you keep
ownership of it. You give us a non-exclusive, worldwide, royalty-free licence to store, reproduce,
and use it for the purpose you submitted it for: to answer you, to publish an approved comment, or
to operate the Site. You confirm you have the right to submit it and that doing so does not
infringe anyone else's rights.

We are not obliged to publish, store, or retain anything you submit. We may remove it.

**Comments,** if we enable them, are moderated. Approving a comment is not endorsement. We may
edit, decline, or remove any comment, and we may permanently destroy it.

How we handle personal data in what you submit is set out in our Privacy Policy, which is part of
these Terms by reference.

### 3.4 Security research

We welcome good-faith security research. If you find a vulnerability, email **[CONTACT EMAIL]**
before disclosing it publicly, give us a reasonable opportunity to fix it, do not access or modify
anyone else's data, and do not degrade the service. We will not pursue legal action against
research conducted on those terms. We do not currently run a paid bug bounty.

### 3.5 The Site's content

Everything we publish on the Site — text, documentation, design, layout, graphics, and code
embedded in the pages — belongs to us or our licensors, and is protected by copyright and other
intellectual property law. You may read it, link to it, quote it with attribution, and print or
save a copy for your own reference. You may not republish it wholesale, sell it, or present it as
your own.

**This licence to the Site's content is separate from, and narrower than, the licence to the
Software in §4.** Do not assume that because the Software is licensed one way, the site copy,
documentation, and design are too.

### 3.6 We may change or discontinue the Site

We may change, suspend, or discontinue the Site or any part of it at any time, without liability
to you. It is a website, not a service you have paid for.

### 3.7 Links to other sites

The Site may link elsewhere. We do not control those sites, do not endorse them, and are not
responsible for them.

---

## 4. The Software: licence

### 4.1 The licence

The Software is made available to you under **[SOFTWARE LICENSE]**. That licence, and not this
document, determines what you may do with the Software: whether you may run it commercially,
modify it, redistribute it, whether you must publish your modifications, and what attribution you
must give.

**Where these Terms and [SOFTWARE LICENSE] conflict as to the Software, [SOFTWARE LICENSE]
prevails.** These Terms add nothing to the rights that licence grants you and take nothing away
from them.

> **Publication blocker.** As of the date this draft was prepared, the Tovu repository contains no
> `LICENSE` file and its package manifest declares no licence. Until a licence is chosen and
> committed, the default legal position is that all rights are reserved and no one has permission
> to copy, modify, or redistribute the Software. This section cannot go live with `[SOFTWARE
> LICENSE]` unfilled. See the note under "Placeholders" above.

### 4.2 Our trademarks are not included

Whatever licence applies to the code, it does not give you rights in our name, logo, or brand.
**[TRADEMARK LIST]** are our marks. You may state truthfully that your product is built on Tovu or
is compatible with Tovu. You may not name your product in a way that suggests we published,
endorsed, or support it, and you may not use our logo as your own.

If you distribute a modified version, do not present it as the official Tovu.

### 4.3 Third-party components

The Software includes and depends on third-party open-source components, each under its own
licence. Those licences govern those components and are included in the distribution. Nothing here
overrides them. It is your responsibility to comply with them if you redistribute.

### 4.4 Contributions

If you contribute code, documentation, translations, themes, or anything else to the Software, you
grant us a perpetual, worldwide, irrevocable, royalty-free licence to use, modify, distribute, and
sublicense your contribution as part of the Software, under the licence the Software is offered
under and any later licence we adopt. You confirm you have the right to grant that, and that your
contribution is your own work or is properly licensed.

*A lawyer may recommend a formal Contributor Licence Agreement or a Developer Certificate of Origin
instead of this paragraph, particularly if you might relicense the Software later.*

---

## 5. Running the Software yourself: what you are responsible for

This section is the practical heart of these Terms for anyone who self-hosts. Please read it.

**You run it. You are responsible for it.** When you install Tovu on your own infrastructure, you
are operating a website. Everything about that website is yours: the server, the database, the
content, the configuration, the security, the backups, and the legal compliance.

Specifically, you are responsible for:

- **Being the data controller for your visitors' personal data.** Your install collects data from
  your visitors into your database. That data is never sent to us, and we have no access to it and
  no visibility into it. Under GDPR, UK GDPR, CCPA, and equivalent laws, that makes **you** the
  controller. You need your own privacy policy, your own lawful bases, and your own process for
  handling data subject requests. **[LEGAL ENTITY NAME] is not your data processor and there is
  nothing for us to sign a data processing agreement about.**
- **Configuring the Software securely.** Including, and we single these out because they have
  direct consequences for your visitors:
  - **Setting a real secret for the comment IP salt (`COMMENTS_IP_SALT`).** If you leave it unset
    and enable comments, the Software falls back to a publicly documented development value, and
    your commenters' IP address hashes become trivially reversible. That is your exposure, not
    ours.
  - **Checking whether your active theme loads web fonts from Google.** If it does, every page of
    your site transmits your visitors' IP addresses to Google. You must disclose that in your own
    privacy policy, or self-host the fonts.
  - **Deciding whether to honor Do Not Track and Global Privacy Control** in the analytics
    configuration.
  - Securing your server, your database, your credentials, your TLS certificates, and your
    administrative accounts.
- **Backups.** We do not have a copy of your site. If you lose it, it is lost.
- **Updates.** We do not update your install. Running an outdated version, including one with a
  known vulnerability, is your decision and your risk.
- **Everything you publish**, and everything your users publish through your install.
- **The lawfulness of what you do with it** — including marketing law, consumer law, accessibility
  law, tax, and anything else that applies to a website in your jurisdiction.

**We do not monitor, control, or have any technical means of intervening in your install.** We
cannot take your site down, cannot see your data, and cannot help you recover it.

### 5.1 The admin AI assistant is bring-your-own-key

The Software's admin interface includes an AI assistant. It uses **your own** API key, for an AI
provider **you** choose and have an account with. When you use it:

- The request goes from your install directly to that provider. It does not pass through any
  service we operate.
- We do not supply, hold, or see your key, and we do not pay for your usage.
- **Your relationship with that provider is governed by their terms and their privacy policy**,
  including whatever they do with the content you send them. Read them.
- Whatever you send the assistant — site content, drafts, prompts — goes to that provider. Do not
  send it anything you are not permitted to disclose to a third party.

AI output can be wrong. Check it before you publish it or act on it. We are not responsible for
what a model generates, for what it costs you, or for decisions you make based on it.

### 5.2 Plugins, themes, and extensions

Tovu supports plugins and themes, including ones we did not write. **Anything you install runs with
the privileges of your site.** A plugin or theme obtained from a third party is that party's
software, under that party's terms, and is not covered by these Terms or by anything we warrant.
Evaluate what you install. We are not liable for third-party extensions.

---

## 6. Pre-release software

Tovu is pre-1.0 software under active development. Interfaces, data formats, database schemas,
configuration, plugin APIs, and behavior **will** change, sometimes in ways that are not backward
compatible. Features may be added, altered, or removed.

Some features present in the codebase are incomplete, disabled, or explicitly non-functional
reference implementations. **Do not assume that a feature exists in a working state because you can
see it in the code or in the interface.** In particular, and by way of example rather than
limitation, the payment provider shipped with the Software is a non-functional reference
implementation with no gateway behind it and cannot process a real payment.

Test upgrades before applying them to a site you care about, and keep backups.

---

## 7. No support obligation

We are not obliged to provide support, maintenance, updates, bug fixes, or security patches for the
Software, and we do not guarantee any response time. We may help; we may not. Any support we do
provide is a courtesy and does not create an ongoing obligation.

If we later offer paid support or a hosted service, that will be under a separate agreement with
its own commitments.

---

## 8. Payments

**We do not currently sell anything.** There are no paid plans, no subscriptions, and no purchases
available on the Site, and the Software's payment machinery is a non-functional reference
implementation (§6).

If we introduce paid services, we will publish separate terms covering price, billing, renewal,
refunds, taxes, and cancellation **before** taking any payment, and we will not charge you for
anything you have not agreed to.

**If you enable payments in your own self-hosted install,** you contract directly with your chosen
payment processor, you are the merchant of record, and PCI-DSS compliance and consumer law
obligations are entirely yours. Note in particular that the Software stores the notifications your
payment processor sends it **verbatim, as received**; if your processor includes customer names or
email addresses in those messages, that personal data is retained in your database and you must
account for it in your own privacy policy and retention practice.

---

## 9. Privacy

Our Privacy Policy explains what the Site collects and what it does with it, and is incorporated
into these Terms. It also explains, at length, the split between our Site and your self-hosted
install.

Two things worth repeating here:

- **Loading a page on tovu.dev sends your IP address to Google**, because the site's typefaces are
  loaded from Google's font servers. This is disclosed in the Privacy Policy.
- **Member records in the Software cannot be permanently deleted** — they can be disabled and their
  identifying fields overwritten, which is what we do on an erasure request. This is a deliberate
  design constraint. If you self-host and take on members, it applies to your install too, and you
  should plan your own erasure process around it.

---

## 10. Suspension and termination

**You** may stop using the Site at any time, and may stop using the Software at any time by
uninstalling it.

**We** may suspend or terminate your access to the Site, or to any account you hold on it, if you
breach these Terms, if we are required to by law, or if we discontinue the Site. Where it is
reasonable to do so, we will tell you first.

**Termination does not reach into your install.** We cannot and will not disable, revoke, or
interfere with a copy of the Software you already hold. Your rights in that copy come from
**[SOFTWARE LICENSE]** and end only as that licence says they do.

Sections that by their nature should survive termination — §3.3 (content licence), §4 (licence and
trademarks), §11, §12, §13, §14, §16 and §17 — survive.

---

## 11. Disclaimer of warranties

**Read this section. It shifts risk onto you.**

To the fullest extent permitted by law:

**THE SITE AND THE SOFTWARE ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED.**

We specifically disclaim all implied warranties of merchantability, fitness for a particular
purpose, title, non-infringement, quiet enjoyment, accuracy, and any warranty arising from a course
of dealing or trade usage.

We do not warrant that:

- the Site or the Software will be uninterrupted, timely, secure, or error-free;
- defects will be corrected;
- the Software is free of vulnerabilities;
- the Software is fit for any particular purpose of yours, or will comply with any law that applies
  to you;
- results obtained from the Site or the Software will be accurate or reliable;
- the Site or the Software will meet your requirements.

**No advice or information, whether oral or written, obtained from us or through the Site, creates
any warranty not expressly stated here.**

**Consumer rights.** Some jurisdictions do not allow the exclusion of certain warranties. If you
are a consumer, you may have statutory rights that cannot be excluded — in the UK under the
Consumer Rights Act 2015, in the EU under national consumer law, and in various US states. Nothing
here limits those rights. Where an exclusion is not permitted, it applies only to the extent it is.

---

## 12. Indemnity

You will indemnify and hold harmless **[LEGAL ENTITY NAME]**, its officers, employees, and agents
from any claim, loss, liability, damage, cost, or expense (including reasonable legal fees) arising
out of:

- your use of the Site or the Software;
- your operation of a self-hosted Tovu install, including any claim by your own visitors or users
  about their personal data;
- content you submit to the Site or publish through your install;
- your breach of these Terms or of any law;
- your infringement of anyone's intellectual property or privacy rights.

We will tell you promptly about any claim we want indemnified, and you may control the defense
provided you do not settle in a way that admits fault on our behalf or imposes any obligation on us
without our written consent.

*If you are a consumer rather than a business, an indemnity of this breadth may be unenforceable
where you live. Ask your lawyer whether this section should be limited to business users.*

---

## 13. Limitation of liability

**Read this section too.**

To the fullest extent permitted by law:

**We are not liable for any indirect, incidental, special, consequential, exemplary, or punitive
damages**, or for any loss of profits, revenue, business, goodwill, anticipated savings, data, or
content — whether in contract, tort (including negligence), or otherwise, and whether or not we
were told such loss was possible.

**In particular, we are not liable for data loss.** You are responsible for your own backups.

**Our total aggregate liability** to you for all claims arising out of or relating to these Terms,
the Site, or the Software is limited to the greater of (a) the total amount you have paid us in the
twelve months before the claim arose, and (b) **[LIABILITY CAP]**.

Because we currently charge nothing, limb (a) is zero for most people. **[LIABILITY CAP]** must
therefore be a real, stated figure — a cap that resolves to nothing may be treated as an attempt to
exclude liability entirely, which many courts will not enforce. Discuss the number with your
lawyer.

**What we do not exclude.** Nothing here excludes or limits our liability for death or personal
injury caused by our negligence, for fraud or fraudulent misrepresentation, or for anything else
that cannot lawfully be excluded. If you are a consumer, your statutory rights are unaffected.

**Basis of the bargain.** The Software is provided free of charge. These limits, together with the
disclaimers in §11, reflect that, and are a fundamental part of the basis on which we make it
available. Without them we would not do so.

---

## 14. Export control and sanctions

You may not use, export, or re-export the Software in violation of any applicable export control
or sanctions law. You confirm that you are not located in, and are not a national or resident of,
a country subject to a comprehensive embargo under **[GOVERNING LAW]**, and that you are not on any
restricted-party or denied-persons list.

---

## 15. Notices

We will give you notice by posting on the Site, or by email if we hold an address for you.

Give us formal legal notice in writing to **[LEGAL ENTITY NAME]**, **[POSTAL ADDRESS]**, with a
copy by email to **[CONTACT EMAIL]**.

---

## 16. Governing law and disputes

These Terms are governed by **[GOVERNING LAW]**, without regard to its conflict-of-laws rules.

Any dispute arising out of or relating to these Terms, the Site, or the Software will be brought
exclusively in the courts of **[VENUE]**, and you and we each consent to their jurisdiction.

**If you are a consumer**, this does not deprive you of the protection of the mandatory law of the
country where you live, or of your right to bring proceedings in your local courts.

**Please talk to us first.** Before starting formal proceedings, email **[CONTACT EMAIL]** and
describe the problem. Most disputes are resolved faster and more cheaply that way.

*Consider with your lawyer whether to add mandatory arbitration and a class-action waiver. These
are common in US-facing terms, are heavily regulated, are generally unenforceable against consumers
in the UK and EU, and are deliberately not included in this draft rather than included badly.*

---

## 17. General

**Entire agreement.** These Terms, the Privacy Policy, and **[SOFTWARE LICENSE]** are the whole
agreement between us about their subject matter, and replace any earlier understanding.

**Severability.** If any provision is held unenforceable, it is modified to the minimum extent
necessary to make it enforceable, or severed if it cannot be. The rest stands.

**No waiver.** If we do not enforce a provision, that is not a waiver of it. Enforcing it later is
not barred by having let it go before.

**Assignment.** You may not assign these Terms without our written consent. We may assign them to
an affiliate or in connection with a merger, acquisition, or sale of assets.

**No agency.** Nothing here creates a partnership, joint venture, employment, or agency
relationship.

**Third parties.** Nobody other than you and us has any right to enforce these Terms.

**Force majeure.** Neither of us is liable for a failure caused by something outside our reasonable
control.

**Headings** are for convenience and do not affect interpretation.

**Language.** These Terms are written in English. If they are translated and the versions differ,
the English version governs.

---

## 18. Contact

| For | Contact |
|---|---|
| Questions about these Terms | **[CONTACT EMAIL]** |
| Legal notices | **[LEGAL ENTITY NAME]**, **[POSTAL ADDRESS]** |
| Security reports | **[CONTACT EMAIL]** |

---

*These Terms were drafted from a technical audit of the Tovu source code and the live tovu.dev
deployment, so that the factual claims in them are verifiable rather than assumed. They have not
been reviewed by a lawyer. Have one in **[JURISDICTION]** review them before relying on them — and
resolve the licensing gap in §4.1 first.*
