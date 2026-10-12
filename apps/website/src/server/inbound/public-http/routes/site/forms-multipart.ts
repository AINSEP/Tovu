/** Multipart parsing with Undici's Web Request API; no handwritten multipart grammar.
 * Local host adapter pending Jini extraction: the live server must not import an unbuilt symbol. */
import type { RequestHandler } from "express";
// Node's bundled parser can turn filename="" into a text control, losing upload identity.
// The installed Undici parser distinguishes absent filenames from empty ones (filename !== null).
import { Request } from "undici";
const MAX_MULTIPART_BYTES = 12 * 1024 * 1024;
/** Decodes bounded multipart bytes into successful controls, preserving repeated choice names.
 * @throws RangeError for oversized bodies/too many controls; parser errors for malformed multipart.
 * @complexity O(b + c), capped at 12 MiB and 2000 controls (20 fields x 100 options). */
export async function parseFormMultipart(
  { bytes, contentType }: { bytes: Uint8Array; contentType: string },
  _optional = {},
): Promise<Record<string, unknown>> {
  if (bytes.byteLength > MAX_MULTIPART_BYTES) throw new RangeError("form upload exceeds 12 MB");
  const request = new Request("http://form.invalid/", { method: "POST", headers: { "content-type": contentType }, body: Buffer.from(bytes) });
  const data = await request.formData();
  const body: Record<string, unknown> = Object.create(null);
  let count = 0;
  for (const [name, raw] of data.entries()) {
    if (++count > 2000) throw new RangeError("too many form controls");
    if (typeof raw !== "string" && raw.name === "" && raw.size === 0) continue;
    const value = typeof raw === "string" ? raw : { filename: raw.name, contentType: raw.type, bytes: new Uint8Array(await raw.arrayBuffer()) };
    if (!Object.hasOwn(body, name)) body[name] = value;
    else {
      const existing = body[name];
      // This array belongs to this parse only; append without quadratic repeated copies.
      if (Array.isArray(existing)) existing.push(value);
      else body[name] = [existing, value];
    }
  }
  return body;
}
/** Express middleware runs after the route-scoped, size-bounded raw parser; malformed input is 400. */
export const parseFormMultipartMiddleware: RequestHandler = async (req, res, next) => {
  if (!req.is("multipart/form-data")) { next(); return; }
  try { req.body = await parseFormMultipart({ bytes: req.body, contentType: req.get("content-type") ?? "" }); next(); }
  catch (error) { res.status(error instanceof RangeError ? 413 : 400).json({ code: "FORMS_SUBMISSION_VALIDATION_ERROR", error: "invalid or oversized multipart form" }); }
};
