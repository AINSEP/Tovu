/**
 * @file Test-fixture admin-surface handler module for the fake "acme-office" plugin: reads the
 * signed-in account through the same host capabilities its executable tool gets, reports status,
 * starts a "pick" sign-in with a declared start parameter, takes the declared callback field once
 * the sign-in completed, verifies it through the provider's API, and saves it in plugin state.
 * `whoami` also keeps its token in module scope (a plugin accident): `last-token` and
 * `save-last-token` try to return or store it in a later call, which the host must refuse.
 * Across seams: `whoami` also hands its token to the tool module (`rememberToken`), and `tool-token`
 * returns the token a TOOL kept; the host's one shared token memory must withhold both.
 * `host-kind` echoes the host kind the handler host was built with. `list-bindings`, `save-binding`
 * and `remove-binding` manage its form-delivery bindings through the host's `deliveryBindings`; the
 * surface also declares `acme-office-ghost`, an adapter the plugin does NOT contribute, which the host
 * must refuse.
 */
import { lastToken as toolToken, rememberToken } from "../tools/whoami.mjs";

let lastToken = null;

export default {
  actions: {
    async whoami({ capabilities, context }) {
      const token = await capabilities.connections.getAccessToken({ connectionId: context.connectionIds[0] });
      lastToken = token;
      rememberToken(token);
      const response = await capabilities.http.fetch({ url: "https://api.acme.test/me" }, { headers: { authorization: `Bearer ${token}` } });
      return { name: (await response.json()).name };
    },
    async status({ capabilities, context }) {
      const status = await capabilities.connections.status({ connectionId: context.connectionIds[0] });
      const appId = await capabilities.publicConfig.get({ name: "TOVU_ACME_CHOOSER_APP_ID" });
      return {
        state: status.status, grantedScopeSetIds: [...status.grantedScopeSetIds],
        ...(status.accountLabel === null ? {} : { accountLabel: status.accountLabel }), ...(appId === null ? {} : { appId }),
      };
    },
    async 'begin-pick'({ capabilities, context }) {
      const started = await capabilities.connections.begin({ connectionId: context.connectionIds[0], action: "reconnect" }, { startParams: { pick_mode: "one" } });
      return { attemptId: started.attemptId };
    },
    async 'take-pick'({ input, capabilities, context, fail }) {
      const connectionId = context.connectionIds[0];
      const fields = await capabilities.connections.takeCallbackFields({ connectionId, attemptId: input.attemptId });
      if (fields === null || fields.picked_ids === undefined) throw fail({ code: "nothing-picked", message: "Nothing was picked. Pick again." });
      const token = await capabilities.connections.getAccessToken({ connectionId });
      const response = await capabilities.http.fetch({ url: `https://api.acme.test/tables/${encodeURIComponent(fields.picked_ids)}` }, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw fail({ code: "pick-not-verified", message: "The picked table could not be opened. Pick again." });
      await capabilities.state.set({ key: "selection", value: { tableId: fields.picked_ids } });
      return { saved: true };
    },
    async 'last-token'() {
      return { name: lastToken };
    },
    async 'tool-token'() {
      return { name: toolToken };
    },
    async 'host-kind'({ context }) {
      return { name: context.hostKind };
    },
    async 'save-last-token'({ capabilities }) {
      await capabilities.state.set({ key: "cached", value: { token: lastToken } });
      return { saved: true };
    },
    async 'list-bindings'({ capabilities }) {
      return { json: JSON.stringify(await capabilities.deliveryBindings.list()) };
    },
    async 'save-binding'({ input, capabilities }) {
      const saved = await capabilities.deliveryBindings.save({
        ...(input.bindingId === undefined ? {} : { bindingId: input.bindingId }), adapterId: input.adapterId, connectionId: input.connectionId, enabled: true,
        ...(input.formSlugs === undefined ? {} : { formIds: input.formSlugs }), config: { table: input.table, accountId: input.accountId },
      });
      return { json: JSON.stringify(saved) };
    },
    async 'remove-binding'({ input, capabilities }) {
      await capabilities.deliveryBindings.remove({ bindingId: input.bindingId });
      return { removed: true };
    },
    async disconnect({ capabilities, context }) {
      const outcome = await capabilities.connections.disconnect({ connectionId: context.connectionIds[0] });
      return { state: outcome.status, revocation: outcome.revocation };
    },
  },
};
