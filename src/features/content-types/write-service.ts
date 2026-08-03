/**
 * @file Content-types' write path — re-exported from `@jini-ai/cms/content-types`.
 *
 * Only `src/widgets/` still imports this path directly, and that module is being ported by
 * separate work in flight, so its imports must not be touched here. When that lands, this shim
 * retires and widgets reaches the domain through `./index.ts` like every other consumer.
 */
export type {
  AuthorizeFn,
  ContentTypeRevisionInput,
  ContentTypeRepoPort,
  IndexProvisionerPort,
  OutboxPort,
  WatermarkPort,
  ContentTypeWriteServiceDeps,
  RegisterContentTypeRequired,
  UpdateContentTypeFieldsRequired,
} from "@jini-ai/cms/content-types";
export { registerContentType, updateContentTypeFields } from "@jini-ai/cms/content-types";
