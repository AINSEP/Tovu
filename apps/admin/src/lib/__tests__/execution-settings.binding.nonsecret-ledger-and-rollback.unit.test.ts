import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_EXECUTION_CONFIG, saveExecutionConfig } from "../execution-settings";
import { settingsApi } from "../admin-http/settings-api";
import { aiAssistantApi } from "../../features/ai-assistant/api/ai-assistant-api";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";

afterEach(() => { vi.restoreAllMocks(); });

it("does not write a typed secret-only change to the ledger", async () => {
  const setSetting = vi.spyOn(settingsApi, "setSetting");
  const next = { ...DEFAULT_EXECUTION_CONFIG, byok: { ...DEFAULT_EXECUTION_CONFIG.byok, apiKey: "sk-TYPED-ONLY" } };
  await expect(saveExecutionConfig(next, DEFAULT_EXECUTION_CONFIG)).resolves.toEqual([]);
  expect(setSetting).not.toHaveBeenCalled();
});

it("keeps the provider form save on the non-secret ledger", async () => {
  const setSetting = vi.spyOn(settingsApi, "setSetting").mockResolvedValue({ key: "byok.baseUrl", scope: "workspace", value: "https://new.example/v1", revisionSeq: 1 });
  const credentialWrite = vi.spyOn(aiAssistantApi, "setAdminExecutionCredential");
  const next = { ...DEFAULT_EXECUTION_CONFIG, byok: { ...DEFAULT_EXECUTION_CONFIG.byok, apiKey: "sk-SENTINEL", model: "new-model" } };

  await expect(saveExecutionConfig(next, DEFAULT_EXECUTION_CONFIG)).resolves.toEqual(["byok.model"]);

  expect(setSetting).toHaveBeenCalledExactlyOnceWith({ namespace: "core.execution", key: "byok.model", scope: "workspace", valueJson: "new-model" });
  expect(JSON.stringify(setSetting.mock.calls)).not.toContain("sk-SENTINEL");
  expect(credentialWrite).not.toHaveBeenCalled();
});

it("scrubs rollback failures at the live sink and rethrows the original write refusal", async () => {
  const refused = new Error("write refused");
  const restoreError = new Error("Authorization: Bearer sk-ROLLBACK-SENTINEL");
  const setSetting = vi.spyOn(settingsApi, "setSetting")
    .mockResolvedValueOnce({ key: "byok.baseUrl", scope: "workspace", value: "https://new.example/v1", revisionSeq: 1 })
    .mockRejectedValueOnce(refused)
    .mockRejectedValueOnce(restoreError);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const next = { ...DEFAULT_EXECUTION_CONFIG, byok: { ...DEFAULT_EXECUTION_CONFIG.byok, model: "new-model", baseUrl: "https://new.example/v1" } };

  await expect(saveExecutionConfig(next, DEFAULT_EXECUTION_CONFIG)).rejects.toBe(refused);

  expect(setSetting.mock.calls.map(([input]) => input.key)).toEqual(["byok.baseUrl", "byok.model", "byok.baseUrl"]);
  expect(log).toHaveBeenCalledExactlyOnceWith("[execution-settings] Could not restore a setting", describeErrorForLog({ err: restoreError }));
  expect(log.mock.calls[0]).not.toContain(restoreError);
});
