// Dev preload, imported AFTER the tsx loader: tsx turns source maps on as it registers, and the
// map cache costs each dev process tens of MB. TOVU_DEV_SOURCE_MAPS=1 keeps TS line numbers in traces.
if (process.env.TOVU_DEV_SOURCE_MAPS !== "1") process.setSourceMapsEnabled(false);
