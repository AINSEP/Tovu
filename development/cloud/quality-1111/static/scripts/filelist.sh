#!/bin/bash
# Prints prod source files (repo-relative) for a repo: filelist.sh tovu|jini
EX=(-g '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}' -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/vendor/**' -g '!**/__tests__/**' -g '!**/__mocks__/**' -g '!**/__measurements__/**' -g '!**/fixtures/**' -g '!**/__fixtures__/**' -g '!**/test/**' -g '!**/tests/**' -g '!**/e2e/**' -g '!**/coverage/**' -g '!**/.build/**' -g '!**/build/**' -g '!**/release/**' -g '!**/*.test.*' -g '!**/*.spec.*' -g '!**/*.typecheck.*' -g '!**/*.d.ts' -g '!**/*.d.mts' -g '!**/*.d.cts' -g '!**/*.test-support.*' -g '!**/*.stories.*')
if [ "$1" = tovu ]; then cd /home/user/Tovu && rg --files "${EX[@]}" apps packages content | grep -Ev '^packages/provider-plugins/plugins/[^/]+/[0-9]+\.[0-9]+\.[0-9]+/|/plugins/[^/]+/[0-9]+\.[0-9]+\.[0-9]+/' | sort
else cd /home/user/Jini && rg --files "${EX[@]}" packages | grep -E '^packages/[^/]+/src/' | sort; fi
