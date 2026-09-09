# The Machines API path — documented, NOT implemented

**Status: blocked. Do not implement this. Do not present it to an operator as available.**

**Reference version:** 1.0.0 (2026-09-09)

---

## What it would be

A deploy that never touches GitHub, CI, or a build at all. The workspace's saved `fly.io`
credential is host-bound to both `https://api.fly.io` and `https://api.machines.dev`, so every
call below is reachable through `custom_credential_make_request` **today**, with no CLI
installed anywhere:

1. `POST /v1/apps` — create the app.
2. `POST /v1/apps/<app>/volumes` — create the volume, mounted at `/workspace/Tovu/sites`.
3. `POST /v1/apps/<app>/secrets/...` — set `TOVU_ADMIN_PASSWORD`, `ANALYTICS_ROOT_KEY_SEED`,
   and `TOVU_INTEGRATIONS_ROOT_KEY`.
4. `POST /v1/apps/<app>/machines` with `config.image` — start exactly one machine.
5. `GET /v1/apps/<app>/machines` — poll until healthy, checking `/readyz`.

No repo. No runner. No remote builder. Faster than CI and with fewer moving parts.

## The one thing that blocks it

**Step 4 requires `config.image` to name a prebuilt, published Tovu image. No such image
exists.**

The CI path does not have this problem because it never names an image — `flyctl deploy`
uploads the build context and Fly's remote builder produces the image from the `Dockerfile` as
part of the deploy. The Machines API has no build step at all: it can only *run* an image
somebody else already built and pushed to a registry it can pull from.

So this path is not "harder" or "less tested" than the CI path. It is **missing its input.**
Until Tovu publishes a versioned image to a registry, there is nothing to put in `config.image`,
and every other step above is scaffolding around a hole.

## What unblocking it would take

A published image, and a decision about where it is published and how it is versioned. That is
a product decision, not something to improvise inside a deploy request.

Everything else is already in place — including the credential host-binding, which is usually
the awkward part.

## Why this file exists

So that the next person to notice that `api.machines.dev` is reachable does not spend an
afternoon building steps 1-3 and 5 before discovering that step 4 has nothing to point at.

If an operator asks for a CLI-free deploy that skips GitHub: the honest answer is that the
mechanism is ready and the image is not. Say that, and use the CI path.

**Every rule in the parent SKILL.md still applies to this path** — one machine, the volume
shadowing `sites/`, secrets never in committed config, `TOVU_INTEGRATIONS_ROOT_KEY` set
explicitly, and code-not-content. Rule 1 in particular becomes *more* load-bearing here, since
`POST /v1/apps/<app>/machines` will happily create a second machine with no warning at all.
