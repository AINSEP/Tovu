import { redactSecrets } from "@jini-ai/core";
import { redactSecretShapes } from "../../apps/website/src/contracts/core/secret-redaction.js";

async function echoProvider() {
  try { await provider.call(); } catch (err) {
    // ruleid: no-provider-error-echo
    throw new Error(`Provider failed: ${err.message}`);
  }
}
async function echoImporter() {
  try { await importer.run(); } catch (problem) {
    const detail = problem.body;
    // ruleid: no-provider-error-echo
    return { message: `Import failed: ${detail}` };
  }
}
async function logProvider() {
  try { await provider.call(); } catch (err) {
    const diagnostic = String(err);
    // ruleid: no-provider-error-echo, log-raw-error
    console.error("provider failed", diagnostic);
  }
}
async function logImporter() {
  try { await importer.run(); } catch (failure) {
    // ruleid: no-provider-error-echo, log-raw-error
    logger.warn({ message: failure.message });
  }
}
async function returnBody() {
  try { await provider.call(); } catch (err) {
    // ruleid: no-provider-error-echo
    res.status(502).json({ error: err.response.data });
  }
}
async function safeProvider() {
  try { await provider.call(); } catch (err) {
    // ok: no-provider-error-echo, log-raw-error
    console.error(redactSecrets({ input: String(err) }, {}));
    const safe = redactSecretShapes({ text: err.message }, {}).text;
    // ok: no-provider-error-echo, log-raw-error
    logger.warn(safe);
    // ok: no-provider-error-echo
    return { message: "Provider request failed" };
  }
}
async function fixedCopyWithCause() {
  try { await importer.run(); } catch (err) {
    // ok: no-provider-error-echo
    throw new Error("Import failed", { cause: err });
  }
}
