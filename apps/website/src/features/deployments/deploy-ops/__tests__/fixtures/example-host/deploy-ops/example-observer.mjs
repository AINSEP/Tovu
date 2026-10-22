/**
 * @file Test fixture: a second, observe-only platform (status and logs, no secrets adapter) so core
 * can prove registry narrowing and secrets-less refusals against more than one loaded platform.
 */
import host from "./example-host.mjs";
const relabel = result => ({ ...result, platform: "example-observer" });
export default { status: async (ctx, input) => relabel(await host.status(ctx, input)), logs: async (ctx, input) => relabel(await host.logs(ctx, input)) };
