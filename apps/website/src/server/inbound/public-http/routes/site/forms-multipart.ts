/** Express adapter for public form submissions; platform owns bounded multipart decoding.
 * Publish/adopt that export before releasing this adapter: the live server must not import an unbuilt symbol. */
import type { RequestHandler } from "express";
import { parseFormMultipart } from "@jini-ai/platform/http/multipart";
export { parseFormMultipart } from "@jini-ai/platform/http/multipart";

/** Express middleware runs after the route-scoped, size-bounded raw parser; malformed input is 400. */
export const parseFormMultipartMiddleware: RequestHandler = async (req, res, next) => {
  // req.is() only matches when a multipart content-type header is present.
  const contentType = req.is("multipart/form-data") && req.get("content-type");
  if (!contentType) { next(); return; }
  try { req.body = await parseFormMultipart({ bytes: req.body, contentType }); next(); }
  catch (error) { res.status(error instanceof RangeError ? 413 : 400).json({ code: "FORMS_SUBMISSION_VALIDATION_ERROR", error: "invalid or oversized multipart form" }); }
};
