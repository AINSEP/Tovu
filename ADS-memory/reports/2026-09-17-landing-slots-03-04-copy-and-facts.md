# Landing page — slots 03 and 04: verified facts and sell copy

Companion to `2026-09-17-tovu-product-brief-for-design.md`. Written for the session building
`tovu-landing.html`, whose slot 03 is "show it working" and slot 04 is "answer the objection."

Every specific claim below was checked against running code, the product's own database, or a live
test run on 2026-09-17/18. Nothing here is a promise about a future release — if it isn't built, it
is not in the sell copy; it is in the "Not built yet" list at the end.

---

## The pitch

Tovu is a content platform where the admin isn't just a UI — it's also a set of tools an AI agent
can call, built once and exposed twice: the same typed, permissioned action backs the screen a
person clicks and the call an agent makes. That's not a slogan; it's roughly **180 separate typed
tools today**, spanning content, media, forms, taxonomy, deployment, security, and more, and the
catalog keeps growing as new admin screens ship.

What that buys a site operator, concretely:

- **An admin that does the work for you.** Type "the /blog page is 404ing since we renamed it,
  fix it and update the sitemap" into the chat dock, and the admin assistant runs the actual
  redirect-creation and sitemap-regeneration tools — the same ones the UI's own buttons call —
  and reports back what it did. It runs as a real local coding-agent process on your machine,
  with tool calls, not a scripted chatbot.
- **A plugin system that behaves like software, not a folder of surgery.** Plugins install,
  enable, disable, and are automatically quarantined if one misbehaves — there's no editing PHP by
  hand and no single bad extension able to take the whole site down silently. The architecture
  already carries real weight: alongside a small first-party plugin (word-count) running live
  today, a full payments-processing framework (multiple gateways, webhook normalization, one file
  and one registration line per new provider) and a sample storefront are built on the same plugin
  SDK — proof it can carry serious complexity, not just toy examples.
- **Agent plugins, two of which run on an open protocol any vendor can speak — not a hand-picked
  list.** Six ship today: GitHub, Supabase, Higgsfield (AI media generation), Fly.io deployment,
  automated site-compliance screening, and a static-site-to-Tovu-theme converter. Two of the six —
  Supabase and Higgsfield — connect through an external MCP server, the open, cross-vendor standard
  covered in full below: a new vendor's integration doesn't require Tovu to write bespoke code for
  it. The other four run entirely on Tovu's own native tool catalog plus a bundled skill file, no
  external server involved — proof the "install a plugin" flow doesn't depend on MCP either. On
  Tovu's own reference site right now, two MCP connections are live end to end: Higgsfield (remote,
  OAuth) and Tovu's own desktop companion app (a local process, no external network at all).
- **Media generation wired to real providers, not a single vendor.** The media library calls
  directly into more than a dozen wired providers today, including OpenAI, ElevenLabs, fal.ai,
  Leonardo AI, and MiniMax for image, audio, and video generation — plus Higgsfield connected as
  a live agent plugin, the same open path any other vendor can use.
- **A theme system with an install-and-switch flow already built.** The admin has a real
  browse/preview/install/activate flow across four theme tiers, from plain HTML/CSS/JS you fully
  own up to a safe, agent-editable JSON structure with no template language at all. Today's catalog
  is Tovu's own themes; a public submission pipeline is the stated direction, not built yet — see
  "What's coming."
- **Your folder, not someone else's account.** Install creates one folder holding the whole
  site — database, uploads, themes, plugins. One SQLite file, no separate database server, no
  signup, no hosted account.

---

## Slot 03 — Show it working

The visitor's question at this depth: *"Is that demo real, or a mockup?"*

Use one real task, end to end, shown slowly. The strongest true example available:

**The task.** In the admin, on the page editor for a page called "Landing sample — xai," the
operator types into the chat dock: *"which page am I on?"* — and the assistant answers naming
that page, its URL slug, its published state, and its id, without being told.

**Why it's worth showing.** It's the difference between a chatbot and an operable product: the
assistant is looking at the same screen the person is looking at. The convincer is the second
half — navigate to the Posts list and ask again, and the answer changes to "the Posts section, no
specific post open." Nothing is remembered or guessed; the page itself is reporting, live.

**The real exchange, captured live in a browser against the running app:**
- On the page editor: *"You're on the page editor for 'Landing sample — xai' (slug /,
  published) — id 4f220108-5113-415a-a264-e787d13d2ec4."*
- On the Posts list: *"You're on the Posts section (/posts) — no specific post open."*
- The first reply took about two seconds and needed no extra lookup call — page context arrives
  with the message itself.

**Other real tasks worth showing instead**, any of which run end to end today (typed sentence →
real tool calls → visible result on the site): publish a page or post, upload and place media,
create a redirect, approve a comment, regenerate the sitemap, add a collection entry, edit
taxonomy.

**Scope note for the demo:** this runs the admin's own local coding-agent process, which is how
the admin assistant works by default. Show the admin doing this, not a public visitor driving the
live site remotely — that path exists only as a deliberately gated demo mode, off in production.

---

## Slot 04 — Answer the objection

The visitor's question at this depth: *"If I self-host, who runs it, where's my content, and can I
leave?"*

**The claim to make: it's your folder, and leaving is a feature, not a fire drill.**

- Installing creates one folder per site holding the database, uploaded files, themes, and
  plugins. Nothing else is needed to run it.
- The database is a single SQLite file — no separate database server to operate, patch, or pay
  for.
- No signup, no hosted account, ever, to run the software itself.
- Leaving is a supported, built-in feature: the site renders to static files and publishes with
  one action to GitHub Pages, Vercel, Netlify, Cloudflare Pages, or any S3-compatible bucket (AWS
  S3, R2, B2, Spaces, MinIO). There's also continuous deployment through a connected GitHub App,
  and the site's own content and config can be committed straight to a git repository you own.
- Media can live on local disk or in an S3-compatible bucket — your choice, not a forced default.
- Backups are built in: restore points with a guided, reversible restore, not a "hope the last
  export still works" scramble.

**The comparison earns its place here — lead with the competitor's real strength, because that's
what makes the rest of the sentence believable:**

- **WordPress** has an ecosystem nothing here can match yet — tens of thousands of plugins and
  themes, near-zero training cost. It also means any plugin is untrusted code with full run of the
  site, which is exactly the plugin-bloat and one-bad-update-breaks-everything story most operators
  have lived through. Tovu's plugins run against a typed, permissioned capability surface instead
  of arbitrary file access.
- **Ghost** has a better writing experience and a mature memberships/newsletter/payments stack.
  Tovu has all three, newer and less battle-tested, on the same permissioned architecture as
  everything else.
- **Payload** has years of production hardening behind its config-as-code developer experience.
  Tovu's content-type model is a similar shape, earning that same track record over time.
- **Directus** wraps a database you already have without taking it over, and ships mature low-code
  automation and dashboards. Tovu deliberately owns its schema and its write path instead — the
  trade that makes every change a typed, permissioned, auditable action, including an AI agent's.

The honest trade, stated plainly because the honesty is the argument: ecosystem size for a safe,
agent-operable write path and a product you can walk away from with your content intact.

---

## External MCP — connect any vendor's tools, not a fixed list

MCP (Model Context Protocol) is an open standard a server publishes so an AI agent can call its
tools directly — the same idea as a plug shape everyone agrees on, instead of Tovu writing custom
integration code for every vendor one at a time. Any server that speaks MCP can be connected; the
bundled agent plugins are proof it's already in use here, not the ceiling of what's connectable.

**How a connection looks, concretely.** A workspace's saved connections support two transports side
by side: `stdio` — a locally spawned process talking over its own stdin/stdout, how Tovu's own
desktop companion app connects today — and `streamable_http`, a remote HTTPS endpoint, how
Higgsfield and Supabase both connect. Authentication is a separate axis from transport: none, a
static credential, or OAuth — a stdio server can use OAuth and an HTTP server can use a static
token, independently of which transport it runs on. Where OAuth applies, Tovu self-configures it
against the vendor's own discovery endpoint and registers itself as a client automatically, no
client id to hand-type for most providers, and supports both the standard browser-redirect flow and
the device-code flow from RFC 8628 — the one built for a self-hosted install with no public
callback URL to redirect back to. When a vendor's OAuth can't be negotiated automatically, the
fallback is a masked in-chat form for pasting a personal access token; the raw value is sealed and
never shown back to the model or written to a log.

**The safety story — connections start closed, not open.** A brand-new connection begins fully
disabled with an empty tool allowlist, whether an operator adds it by hand or a plugin provisions
it. From there, the same rules hold for every connection, not just the bundled ones:
- **Default deny.** A remote server can advertise a hundred tools; the agent is exposed to none of
  them until the site owner names each one, by exact name, in an allowlist. Discovering a tool is
  not the same as being allowed to call it.
- **Writes need a second, separate grant.** A tool that admits — through its own MCP metadata —
  that it isn't read-only is refused even after being allowlisted, unless the owner has also named
  it in a second, write-specific list. Visible to the agent and allowed to write are two different
  decisions, and only the site owner can grant the second one. The one real gap: a remote server
  that stays silent about whether a tool writes is admitted on the first list alone — this
  mechanism only catches a vendor that's honest about it.
- **A tool that flags itself as destructive is refused outright, with no override available,**
  regardless of any grant.
- Every remote tool is renamed on the way in so it can never collide with or impersonate one of
  Tovu's own tools, and third-party tool descriptions and results are boundary-marked before they
  reach the model — the same defense Supabase's own MCP server applies to its own query output.

That isn't a hypothetical policy — it's what's configured today. On Tovu's own reference site, the
Higgsfield connection allows 8 of its remote tools and separately write-grants 3 of those; the
desktop connection allows 3 tools and write-grants 2. Nothing outside those lists is callable.

**What ships bundled today.** Six agent plugins: GitHub (commits, Actions runs, logs, through the
workspace's own saved credential — no external MCP involved), Supabase (schema, SQL, and docs
through Supabase's own hosted MCP server, OAuth-connected, read-only by default), Higgsfield (AI
image and video generation, OAuth-connected to Higgsfield's own hosted MCP server — it comes with
the product, not as an add-on to go find separately), Fly.io deployment, automated site-compliance
screening, and a static-site-to-Tovu-theme converter — the last three run entirely on Tovu's own
native tools with a bundled skill file, no external server at all. MCP is the mechanism the two
vendor-facing plugins use; the other four show that installing and running a plugin doesn't require
it.

---

## FAQ — the real objections, answered with what's actually built

**"Every WordPress site I've run eventually breaks from a plugin update. How is this different?"**
Plugins install, enable, and disable through a typed runtime, and one that misbehaves is
automatically quarantined rather than left to silently corrupt the site. No plugin gets raw
database schema access — it can't reach into another plugin's or core's data by accident.

**"I don't trust running other people's code with full access to my site."**
No plugin — first-party today, third-party eventually — gets arbitrary code execution against the
whole system. Every plugin acts through the same permissioned, typed capability surface the admin
itself uses; it can't silently gain more access than it was granted. Connections out to outside
vendors are locked down the same way, with their own default-deny allowlist — see "External MCP"
above for exactly how.

**"Patching a CMS, its plugins, and its database server is a part-time job."**
There's no separate database server to patch or expose — the whole site is one process and one
SQLite file. Restore points exist specifically so an update that goes wrong is a rollback, not an
incident.

**"Hosting a real CMS gets expensive fast."**
Nothing requires a managed database or a paid platform. Run it anywhere that runs Node, or export
the whole site to static files and publish free to GitHub Pages, Netlify, Vercel, Cloudflare Pages,
or your own storage bucket.

**"Migrating off a CMS is always worse than promised."**
Static export and one-shot publish are built in, to five different target types, plus continuous
deployment via a connected GitHub App and direct git commits of the site's own content. There is no
separate "export tool" to buy or beg for later — it's the same path you'd use on day one.

**"Am I locked into your hosting or your account system?"**
There is no Tovu account or hosted service required to run the software. Every site is a folder you
own, on infrastructure you choose.

**"Do I need an API key to use the AI features?"**
No, not to run the site. The admin assistant runs a local coding-agent process by default. If you'd
rather use a hosted model instead, server-side keys for Anthropic, OpenAI, Azure OpenAI, and Google
are all supported.

**"Which database, and can I use Postgres?"**
SQLite, one file per site, today. Postgres is a planned second backend, not yet available — don't
build around it existing.

**"Can I bring my own theme, or am I stuck with what ships?"**
Yes — four theme tiers, from plain HTML/CSS/JS you fully control up to a template language or a
pure-data structure an AI agent can edit safely. Browse, preview, install, and activate are real
today, working against Tovu's own built-in catalog. A public marketplace for outside theme authors
is the stated direction, not something built yet — see "What's coming" below.

---

## What's coming

Three marketplaces are the stated direction: a theme marketplace, a plugin marketplace, and an
agent-plugin marketplace, so outside authors can publish and site owners can install from more than
Tovu's own catalog. None of the three exist yet, and none has a ship date — what exists today, and
is real now, is the built-in catalog and the browse/preview/install/activate flow described above
for themes, plus the equivalent install/enable/disable flow for plugins and agent plugins.

---

## Not built yet

Stated plainly so nobody writes a false claim onto a public page. Each of these is either backlog
only or explicitly deferred, verified against running code, not documentation:

- A public, third-party theme, plugin, or agent-plugin marketplace — see "What's coming" above for
  the stated direction. Today's install/browse/activate flow works against Tovu's own built-in
  catalog only, with no outside submission pipeline or remote index behind it yet.
- Answer-engine or generative-engine optimization (AEO/GEO) — backlog only, nothing built.
- Postgres as a database option — deferred, evaluation logic only, no live adapter.
- Tovu acting as an MCP server so an outside AI client (like a desktop AI app) can drive Tovu's own
  tools — only the outbound direction (Tovu connecting out to other vendors' MCP servers) exists
  today.
- WebMCP — letting a general-purpose browser agent operate the public site the way it can already
  navigate other agent-ready pages — is a decided direction, not yet built.
- Full-text search across custom collections — search today covers posts and pages only.
- A verified public claim that this exact marketing site's live domain is served through Tovu's own
  publish path end to end. What's confirmed: the page is authored and edited in a real Tovu admin.
  What hasn't been separately confirmed is the production deploy mechanism for the public domain —
  don't state this as a fact until that's checked.
