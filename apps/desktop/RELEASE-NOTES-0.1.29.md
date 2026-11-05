# Tovu Desktop 0.1.29

## Improved

- Lower memory while chatting. Long chats no longer reload the whole conversation every second, and saving a running reply writes only what changed.
- Idle sites go to sleep. A new "Sleep idle sites after" setting (default 10 minutes) stops a site's server when nothing is using it; a running chat, deploy, export, upload or newsletter keeps it awake. A sleeping site shows "Sleeping" on its card.
- A site server that crashes restarts by itself (after 1 s, 5 s, then 30 s) before showing a plain error.

## Fixed

- An assistant that could not start after a site restarted now starts, and when it cannot, the chat says why in plain words.
- A plugin that is turned on and signed in gets its tools, whichever happened last (Higgsfield Media showed zero tools).
- Replacing a theme file no longer asks for approval; the earlier versions are kept (up to 20 per file).
- Sending while a reply is running no longer sends the same message twice, and Cmd/Ctrl+Enter sends instead of cancelling.
- The theme preview bar sits at the top, centred, on every theme.
