/**
 * @file Test fixture: a second, unrelated plugin ("other-vendor") whose push destination happens to
 * use an adapter id the acme-office surface also declares. The host must never let acme-office save
 * or manage bindings for it. Never delivers anything real.
 */
export default {
  async deliver() { throw new Error('the other-vendor fixture never delivers'); },
};
