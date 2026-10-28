# RUN-LOG
- STARTED 2026-10-28T05:10:55Z | Tovu HEAD 7d2291064706016bdaa5de62472fb8e316fbae69 | Jini HEAD f68294e608fb8083b864f47319e007d9ccb2efc1
- 2026-10-28T05:14:01Z Node 24.22 installed; Jini pnpm install OK (32s); Jini build running.
- 2026-10-28T05:14:01Z FAIL: Tovu `npm ci` exit 1: E404 @jini-ai/cookie-consent@^0.6.12 not on npm (package.json:134; core/chat etc. exist up to 0.6.12). FINDING: clean Tovu install broken for any registry-only environment. Workaround: analysis runs on a scratch COPY of Tovu (outside repo) with cookie-consent -> file:/home/user/Jini/packages/cookie-consent; npm install --ignore-scripts OK (748 pkgs). No tracked files changed.
