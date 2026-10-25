Programmer(Execution): Used the Programmer persona for the lifecycle fix and regression tests. Implemented in both worktrees; no tests, builds, browser checks, or commits run.

1. **Labels:** The preflight card lacked its own tool input for resolving values. Tovu now supplies title/label metadata; Jini uses it for `Agent plugins: GitHub` and the accessible frame name.  
   **Jini:** `question-answer.ts`, `core/index.ts`, `mcp-ui-question-input.ts`, `McpUiSurfaceCard.tsx`.  
   **Tovu:** `ask-choice-tool.ts`.

2. **Reload:** Answer delivery only updated transient client state. There was no tool result or durable receipt linked to this standalone card. Tovu now emits a resource-bound `user_message` receipt through the existing event stream; Jini restores the collapsed card and bubble from it. Receipt identity also prevents duplicate bubbles.  
   **Jini:** `accepted-input.ts`, `useAnsweredCards.ts`, `McpUiSurfaceCard.tsx`.  
   **Tovu:** `ask-choice-tool.ts`, `automatic-agent-plugins.ts`, `agent-daemon-server.ts`.

   **This predates `e5f49697`.** Tovu introduced this preflight in `a813c3828` on October 18; Jini’s pre-`e5f49697` replay logic only matched tool-bound answers.

3. **Waiting status:** The standalone-form heuristic could lose the waiting signal when later activity arrived. Explicit question metadata now keeps it waiting until its matching receipt arrives.  
   **Jini:** `run-activity.ts`. **Tovu:** metadata supplied by `ask-choice-tool.ts`.

Static checks found no TypeScript diagnostics in the nine touched Jini files. Measured maximum CCN is **10** across the six relevant implementation files. Linked build output remains unchanged.

Run from **Jini `packages/chat`**:

```bash
npx vitest run src/core/__tests__/run-activity.test.ts src/react/components/__tests__/surface-question-replay.test.tsx src/react/components/__tests__/standalone-approval.test.tsx src/react/components/__tests__/answered-question.test.tsx --maxWorkers=2 --minWorkers=1
```

Run from **Tovu `apps/admin`**, after refreshing the linked chat build:

```bash
npx vitest run src/lib/__tests__/agent-plugin-choice-replay.unit.test.ts --maxWorkers=2 --minWorkers=1
```

The adjusted website fixtures use `node:test`. Run from **Tovu root**:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/assistant/__tests__/automatic-agent-plugin-choice.test.ts apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts
```
