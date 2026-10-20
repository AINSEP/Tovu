/**
 * @file Test-fixture executable tool for the fake "acme-office" plugin: reads the table the plugin's
 * admin surface saved in plugin state (read-only for tools).
 */
export default {
  async invoke({ capabilities }) {
    return { selection: await capabilities.state.get({ key: "selection" }) };
  },
};
