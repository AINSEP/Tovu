# Supabase: when something goes wrong

Each case: what you notice, what to tell the person (plain words, at most one link), and what to
do. Never paste Supabase's raw error text. Never retry more than once on your own.

## Sign-in not finished

`agent_plugin_connect` returned `{ status: "waiting-for-sign-in" }` (nobody finished within a few
minutes, which is normal during a new sign-up).

> Still waiting for you to sign in to Supabase. Use the sign-in button above, then say "done".

On "done" (or "I'm back"), call `agent_plugin_connect { pluginId: "supabase" }` once more. Never call
it again on your own.

## They said no at Supabase

The person says they declined, cancelled, or closed the Supabase page.

> Supabase wasn't connected. You can try again whenever you like.

Stop. Start again at Step 1 only if they ask.

## At the free limit

`mcp__supabase__create_project` fails with an error containing
"maximum limits for the number of active free plan projects", or two databases are already active
on a free account. Use the skill's
**At the free limit** section: offer to use one, pause one, or get a paid database.

## The database is asleep

A database they picked has status `INACTIVE` (Supabase puts free databases to sleep after a week
without use).

> That database is asleep. Waking it up now, about a minute.

Call `mcp__supabase__restore_project`, then check with `mcp__supabase__get_project` (at most 10
times) until it is `ACTIVE_HEALTHY`.

## Creating failed

`mcp__supabase__get_project` shows `INIT_FAILED`.

> Supabase couldn't finish creating the database. Want me to try again?

On yes, go back to the skill's Step 4 once. Never remove or pause anything to fix this.

## They want to change data or make tables

Making tables or changing or deleting data from chat is not available yet.

> I can't make tables or change data in your database from chat yet. You can do it in Supabase's
> table editor for now. [Open it in Supabase →](https://supabase.com/dashboard/project/<id>/editor)

## Connection stopped working

A Supabase call says the connection "is disconnected", "expired" or "was revoked", or fails with
401.

Call `external_mcp_reauth_prompt` for `supabase`, and say:

> Your Supabase connection stopped working. Sign in again to keep going.

After they sign in, retry the step once.

## Supabase is down or busy

A timeout, a connection error, a 5xx, or 429 (too many requests).

> Supabase isn't responding right now. Try again in a few minutes.

At most one retry later in the same conversation, never in a loop.

## A Supabase step is refused by Tovu

A call is refused as not allowed (for example `not-in-operator-allowlist`). This means the
connection's permissions were changed by someone on this site.

> That step isn't turned on for this site. An admin can turn it on in Tovu's settings.

Do not retry it.
