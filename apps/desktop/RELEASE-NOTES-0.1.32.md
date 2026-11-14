# Tovu Desktop 0.1.32

## Fixed

- The "Chat with this site" bubble shows again on sites the app serves. 0.1.31 shipped without part of the chat files.
- Charts render again. After the move to Jini 0.7.0 the Recharts plugin stayed off, and its error filled the log every few seconds.
- A plugin that keeps failing to load is logged once, then retried less often, instead of every 5 seconds.
