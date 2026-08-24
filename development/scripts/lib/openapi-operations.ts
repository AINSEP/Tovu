/**
 * Parses `openapi/*.yaml` (Tovu's hand-verified OpenAPI 3.0.3 fragments) into a flat list of
 * operations that `check-openapi-contract.ts` and `check-openapi-secret-leaks.ts` both probe
 * against a real running server.
 *
 * Each fragment is self-contained (no cross-file `$ref`s, per `openapi/README.md`), so `$ref`
 * resolution below only ever needs to look inside the SAME document.
 */
import fs from "node:fs";
import path from "node:path";

import { load as loadYaml } from "js-yaml";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiOperation {
  /** Basename of the source fragment, e.g. `021-media-assets.yaml`. */
  readonly file: string;
  readonly method: HttpMethod;
  /** Raw path key from the spec, e.g. `/api/admin/v1/workspaces/{workspaceId}/media/{mediaId}`. */
  readonly urlTemplate: string;
  /** `{param}` tokens in `urlTemplate`, in left-to-right order. */
  readonly pathParams: readonly string[];
  readonly operationId: string;
  readonly tags: readonly string[];
  /** Documented response status codes, e.g. `["200","401","403","404","500"]`. */
  readonly statusCodes: readonly string[];
  /** Resolved security: doc-level default overridden per-operation when `security` is present there. */
  readonly requiresAuth: boolean;
  readonly requestBodyRequired: boolean;
  /** The lowest documented 2xx response, with its `$ref`-resolved description text (used by the
   *  secret-leak check to find routes that explicitly document "nothing sensitive is returned"). */
  readonly successResponse: { readonly status: string; readonly description: string } | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw parsed YAML, shape-checked ad hoc below
type YamlNode = any;

function resolveRef(doc: YamlNode, ref: string): YamlNode {
  const segments = ref.replace(/^#\//, "").split("/");
  let node: YamlNode = doc;
  for (const segment of segments) node = node?.[segment];
  return node;
}

function resolveResponseDescription(doc: YamlNode, responseNode: YamlNode): string {
  if (!responseNode) return "";
  const resolved = responseNode.$ref ? resolveRef(doc, responseNode.$ref) : responseNode;
  return typeof resolved?.description === "string" ? resolved.description : "";
}

function pathParamsOf(urlTemplate: string): string[] {
  return [...urlTemplate.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

/** Reads and flattens every `openapi/*.yaml` fragment in `openApiDir` into operations. */
export function loadOpenApiOperations(openApiDir: string): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  const files = fs.readdirSync(openApiDir).filter((f) => f.endsWith(".yaml")).sort();

  for (const file of files) {
    const doc: YamlNode = loadYaml(fs.readFileSync(path.join(openApiDir, file), "utf8"));
    const paths: Record<string, YamlNode> = doc?.paths ?? {};
    const docRequiresAuth = Array.isArray(doc?.security) && doc.security.length > 0;

    for (const [urlTemplate, pathItem] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const op: YamlNode = pathItem?.[method];
        if (!op) continue;

        const responses: Record<string, YamlNode> = op.responses ?? {};
        const statusCodes = Object.keys(responses);
        const successStatus = statusCodes.filter((s) => /^2\d\d$/.test(s)).sort()[0];

        operations.push({
          file,
          method,
          urlTemplate,
          pathParams: pathParamsOf(urlTemplate),
          operationId: typeof op.operationId === "string" ? op.operationId : `${method}_${urlTemplate}`,
          tags: Array.isArray(op.tags) ? op.tags : [],
          statusCodes,
          requiresAuth: Array.isArray(op.security) ? op.security.length > 0 : docRequiresAuth,
          requestBodyRequired: op.requestBody?.required === true,
          successResponse: successStatus
            ? { status: successStatus, description: resolveResponseDescription(doc, responses[successStatus]) }
            : undefined,
        });
      }
    }
  }
  return operations;
}

/** Substitutes `{param}` tokens in `op.urlTemplate` with `params[param]`, falling back to
 *  `"placeholder"` for any path param the caller doesn't care about for a given probe. */
export function buildUrl(op: OpenApiOperation, params: Record<string, string>): string {
  let url = op.urlTemplate;
  for (const param of op.pathParams) {
    url = url.replace(`{${param}}`, encodeURIComponent(params[param] ?? "placeholder"));
  }
  return url;
}
