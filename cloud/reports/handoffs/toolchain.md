# Toolchain notes (portable-fin, cloud)

Set up in P0, 2026-11-07. Reuse; do not redo.

- Node 24.2.0 is installed at `~/.local/node24` (nodejs.org tarball). Every shell: `export PATH=~/.local/node24/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
  The image default is Node 22 under `/opt/node22`; it wins unless PATH is set as above.
- `corepack enable --install-directory ~/.local/node24/bin` done. `pnpm -v` = 10.33.2 (from Jini `packageManager`), `npm -v` = 11.3.0.
- Jini: `CI=true pnpm install --frozen-lockfile` works (warnings only: ignored build scripts, missing `jini-mcp` bin before build). `pnpm --filter @jini-ai/core run build && pnpm --no-bail -r build` exits 0.
- Tovu: `npm ci`, `npm run build --workspace @tovu/sdk`, `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` (68 links), `npm --prefix packages/contracts run build` all exit 0. Linking leaves `git status` clean.
- `pnpm --filter @jini-ai/plugin-catalog generate` works; on the P0 merge tip it produced no diff.
- P1a: Jini lockfile edited once (`pnpm install --no-frozen-lockfile`); frozen install works again after it.
  The neutral-host folder (`J server/src/__tests__/neutral-host/support/`) runs outside the repo with
  `node self-check.ts` (Node 24 type stripping) once `@jini-ai/{agent-plugins,core,daemon}` resolve.
