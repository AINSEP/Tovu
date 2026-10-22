/**
 * @file Test fixture: a deploy-capable platform (status, logs and deploy) so core can prove the
 * generic deploy runner's capability listing ("Platforms that can deploy: ...") without a vendor.
 */
import host from "./example-host.mjs";
const relabel = result => ({ ...result, platform: "example-pipeline" });
async function deploy(ctx, { target, ref = "main" }) {
  await ctx.send({ method: "POST", url: `https://api.example-host.dev/v1/targets/${encodeURIComponent(target)}/deploys`, body: { ref } });
  return { platform: "example-pipeline", target, started: true, summary: `Deploy of '${ref}' started.` };
}
export default { status: async (ctx, input) => relabel(await host.status(ctx, input)), logs: async (ctx, input) => relabel(await host.logs(ctx, input)), deploy };
