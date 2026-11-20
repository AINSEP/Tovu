import { PayloadTooLargeError, readStreamText } from "@jini-ai/cli";
import { ValidationError } from "../../platform/site-dir/errors.js";

export async function readStdinOrRefuse(
  { input = process.stdin }: { input?: NodeJS.ReadableStream },
  { flag }: { flag: string },
): Promise<string> {
  try {
    return await readStreamText({ input });
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw new ValidationError({ message: `init: ${flag} payload is too large` });
    throw e;
  }
}
