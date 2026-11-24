/** Public door of Tovu's site routing adapter; reserved-path checks live in `@jini-ai/cms/routing/site/reserved-paths`. */
export {
  postPublicPath,
  entryPublicPath,
  registerResolvePhase,
  runPostContentPhase,
  runPreContentPhase,
  urlFor,
} from './adapter.js';
