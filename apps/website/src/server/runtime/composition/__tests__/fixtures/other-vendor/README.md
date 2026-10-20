# other-vendor (test fixture)

A second fake plugin that contributes only a push form destination, `acme-office-ghost`, the id the
acme-office fixture surface declares in `deliveryAdapters` without contributing it. Used by
`../../form-delivery-oauth.integration.test.ts` to prove the host refuses an adapter another plugin
owns (`adapter-not-owned`). Not shipped; nothing in `content/` refers to it.
