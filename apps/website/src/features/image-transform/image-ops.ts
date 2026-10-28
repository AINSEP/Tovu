import sharp, { type Sharp } from "sharp";
import { Validator, type Schema } from "@cfworker/json-schema";

/**
 * @file Pure image operations behind `image_transform`: validate output specs, then resize / crop /
 * rotate / flip / re-encode one source into up to {@link IMAGE_LIMITS.maxOutputs} files, ICO
 * included. Bytes in, bytes out — no filesystem, no Tovu imports — so it can move to a Jini package
 * unchanged once a second host needs it.
 *
 * sharp already strips metadata unless asked to keep it, and auto-orients here, so a phone photo
 * comes out the right way up with no GPS/EXIF. ICO has no sharp encoder: {@link encodeIco} packs
 * PNG entries (valid since Windows Vista, read by every current browser).
 */

export const IMAGE_LIMITS = { maxOutputs: 8, maxDimension: 8192, maxSourceBytes: 25 * 1024 * 1024, maxInputPixels: 64_000_000, timeoutSeconds: 20 } as const;
export type ImageLimits = { -readonly [K in keyof typeof IMAGE_LIMITS]: number };

const FORMATS = { png: ["png"], jpeg: ["jpg", "jpeg"], webp: ["webp"], avif: ["avif"], ico: ["ico"] } as const;
export type ImageFormat = keyof typeof FORMATS;
export const IMAGE_FORMATS = Object.keys(FORMATS) as ImageFormat[];
export const IMAGE_CONTENT_TYPES: Record<ImageFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", ico: "image/x-icon" };
const SOURCE_FORMATS = new Set(["png", "jpeg", "webp", "gif", "heif", "avif", "tiff", "svg"]);
const DEFAULT_ICO_SIZES = [16, 32, 48];
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

export interface ImageOutput {
  path: string; format: ImageFormat; stripMetadata: boolean; icoSizes: number[];
  resize?: { width?: number; height?: number; fit?: "cover" | "contain" | "inside" | "outside" | "fill"; position?: string; withoutEnlargement?: boolean };
  extract?: { left: number; top: number; width: number; height: number };
  rotate?: number; flip?: boolean; flop?: boolean; background?: string; quality?: number;
}
export interface RenderedImage { path: string; format: ImageFormat; width: number; height: number; bytes: Buffer }

const DIM = { type: "integer", minimum: 1, maximum: IMAGE_LIMITS.maxDimension } as const;
/** Bounds every number that sizes work. Previously sharp rejected bad fit/position/colour by name;
 * the schema now checks fit and types first, and sharp still validates position and colour. */
export const OUTPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["path", "format"], properties: {
  path: { type: "string", minLength: 1, description: "File path in the destination, with the format's extension (theme: e.g. 'assets/favicon.ico'; media: the file name)." },
  format: { type: "string", enum: IMAGE_FORMATS },
  resize: { type: "object", additionalProperties: false, properties: { width: DIM, height: DIM, fit: { type: "string", enum: ["cover", "contain", "inside", "outside", "fill"], description: "Default cover." }, position: { type: "string", description: "cover/contain anchor: centre, top, right top, … or attention/entropy." }, withoutEnlargement: { type: "boolean" } } },
  extract: { type: "object", additionalProperties: false, required: ["left", "top", "width", "height"], description: "Crop this source rectangle first.", properties: { left: { type: "integer", minimum: 0 }, top: { type: "integer", minimum: 0 }, width: DIM, height: DIM } },
  rotate: { type: "number", minimum: -360, maximum: 360 }, flip: { type: "boolean" }, flop: { type: "boolean" },
  background: { type: "string", description: "Colour for contain padding / rotation / jpeg flattening, e.g. '#ffffff'. Default transparent (jpeg: white)." },
  quality: { type: "integer", minimum: 1, maximum: 100 },
  stripMetadata: { type: "boolean", description: "Default true (EXIF/GPS removed)." },
  icoSizes: { type: "array", items: { type: "integer", minimum: 1, maximum: 256 }, minItems: 1, uniqueItems: true, maxItems: 8, description: "ico only; default [16,32,48]." },
} } satisfies Schema;

const outputValidator = new Validator(OUTPUT_SCHEMA);

/** A request a different input fixes; the message names the output and the rule. */
export class ImageTransformError extends Error {
  constructor({ message }: { message: string }, _optional = {}) { super(message); this.name = "ImageTransformError"; }
}
const refuse = (message: string): never => { throw new ImageTransformError({ message }); };

/** Schema first (keys, enums, bounded numbers), then a path extension matching the format, so the
 * file opens as what it is. */
function normalizeOne(raw: unknown, index: number): ImageOutput {
  const o = (raw ?? {}) as Record<string, unknown>;
  const at = `outputs[${index}]`;
  const validation = outputValidator.validate(o);
  if (!validation.valid) refuse(`${at}: ${validation.errors.map((error) => `${error.instanceLocation.replaceAll("/", ".")} ${error.error}`).join("; ")}`);
  const format = o.format as ImageFormat;
  if (!(FORMATS[format] as readonly string[]).includes((o.path as string).split(".").pop()!.toLowerCase())) refuse(`${at}: ${format} needs a .${FORMATS[format][0]} extension on '${String(o.path)}'`);
  return { ...o, format, stripMetadata: o.stripMetadata !== false, icoSizes: (o.icoSizes as number[] | undefined) ?? DEFAULT_ICO_SIZES } as ImageOutput;
}

/**
 * Validates every output before any decode: 1..maxOutputs, unique paths, known keys, supported
 * format with a matching extension, bounded numbers. @throws {ImageTransformError} @complexity O(n).
 */
export function normalizeOutputs({ outputs }: { outputs: unknown }, _optional = {}): ImageOutput[] {
  if (!Array.isArray(outputs) || outputs.length === 0 || outputs.length > IMAGE_LIMITS.maxOutputs) refuse(`'outputs' must list 1 to ${IMAGE_LIMITS.maxOutputs} outputs`);
  const normalized = (outputs as unknown[]).map(normalizeOne);
  if (new Set(normalized.map(({ path }) => path.toLowerCase())).size !== normalized.length) refuse("an output path is listed more than once");
  return normalized;
}

const open = (source: Buffer, limits: ImageLimits): Sharp => sharp(source, { limitInputPixels: limits.maxInputPixels }).timeout({ seconds: limits.timeoutSeconds });

/** Size, format and pixel caps on the source. Undecodable bytes become a caller-facing refusal. */
async function checkSource(source: Buffer, limits: ImageLimits) {
  if (source.length > limits.maxSourceBytes) refuse(`the source is larger than ${limits.maxSourceBytes} bytes`);
  const meta = await open(source, limits).metadata().catch((error: Error) => refuse(`the source is not a supported image or exceeds the input pixel limit: ${error.message}`));
  if (!SOURCE_FORMATS.has(meta.format ?? "")) refuse(`the source is not a supported image (it is ${meta.format})`);
  if (meta.width * meta.height > limits.maxInputPixels) refuse(`the source has more than ${limits.maxInputPixels} pixels`);
  return meta;
}

/** Source facts for planning, without rendering anything. @complexity one header decode. */
export async function inspectImage({ source }: { source: Buffer }, { limits = {} }: { limits?: Partial<ImageLimits> } = {}) {
  const meta = await checkSource(source, { ...IMAGE_LIMITS, ...limits });
  return { format: meta.format === "heif" ? "avif" : meta.format, width: meta.autoOrient.width, height: meta.autoOrient.height, hasAlpha: meta.hasAlpha, bytes: source.length };
}

/** Geometry in a fixed order: orient, crop, rotate, mirror, resize. */
function geometry(image: Sharp, o: ImageOutput): Sharp {
  const background = o.background ?? CLEAR;
  let next = image.autoOrient();
  if (o.extract) next = next.extract(o.extract);
  if (o.rotate) next = next.rotate(o.rotate, { background });
  if (o.flip) next = next.flip();
  if (o.flop) next = next.flop();
  return o.resize ? next.resize({ ...o.resize, background }) : next;
}

async function encode(source: Buffer, o: ImageOutput, limits: ImageLimits): Promise<RenderedImage> {
  let image = geometry(open(source, limits), o);
  if (o.format === "jpeg") image = image.flatten({ background: o.background ?? "#ffffff" });
  if (!o.stripMetadata) image = image.keepMetadata();
  const { data, info } = await image.toFormat(o.format as Exclude<ImageFormat, "ico">, { quality: o.quality }).toBuffer({ resolveWithObject: true });
  if (Math.max(info.width, info.height) > limits.maxDimension) refuse(`${o.path}: output exceeds ${limits.maxDimension}px per side`);
  return { path: o.path, format: o.format, width: info.width, height: info.height, bytes: data };
}

/** ICONDIR + one 16-byte entry per PNG; a 256px side is stored as 0. @complexity O(total bytes). */
export function encodeIco({ entries }: { entries: readonly RenderedImage[] }, _options = {}): Buffer {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ width, height, bytes }, index) => {
    const at = 6 + 16 * index;
    head.writeUInt8(width % 256, at); head.writeUInt8(height % 256, at + 1);
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(bytes.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += bytes.length;
  });
  return Buffer.concat([head, ...entries.map(({ bytes }) => bytes)]);
}

async function renderOne(source: Buffer, o: ImageOutput, limits: ImageLimits): Promise<RenderedImage> {
  if (o.format !== "ico") return encode(source, o, limits);
  const pngs = [];
  for (const size of o.icoSizes) pngs.push(await encode(source, { ...o, format: "png", resize: { ...o.resize, fit: o.resize?.fit === "cover" ? "cover" : "contain", width: size, height: size, withoutEnlargement: false } }, limits));
  const largest = pngs.reduce((a, b) => (b.width > a.width ? b : a), pngs[0]!);
  return { path: o.path, format: "ico", width: largest.width, height: largest.height, bytes: encodeIco({ entries: pngs }) };
}

/** Bound derived sizes BEFORE decoding: outside fit and one-sided resizes can amplify aspect ratios.
 * ICO entries have their own forced-square size bound. Rotation uses the bounding rectangle.
 * @throws ImageTransformError on an over-cap side. @complexity O(1). */
function checkOutputSize({ output: o, width, height, maxSide }: { output: ImageOutput; width: number; height: number; maxSide: number }): void {
  if (o.format === "ico") return;
  if (o.extract) { width = o.extract.width; height = o.extract.height; }
  const radians = (o.rotate ?? 0) * Math.PI / 180;
  const rotated = [Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)), Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians))];
  [width, height] = rotated as [number, number];
  [width, height] = resizedSides({ sides: [width, height], resize: o.resize });
  if (Math.round(Math.max(width, height)) > maxSide) refuse(`${o.path}: output exceeds ${maxSide}px per side`);
}

/** Predict resize bounds; padded/cover/fill sizes are explicit, outside preserves the aspect ratio. */
function resizedSides({ sides, resize }: { sides: [number, number]; resize: ImageOutput["resize"] }): [number, number] {
  if (!resize) return sides;
  const [width, height] = sides;
  const ratios = [resize.width === undefined ? undefined : resize.width / width, resize.height === undefined ? undefined : resize.height / height].filter((r): r is number => r !== undefined);
  if (!ratios.length) refuse("resize needs width or height");
  let scale = Math.min(...ratios);
  if (resize.fit === "outside") scale = Math.max(...ratios);
  if (resize.withoutEnlargement) scale = Math.min(1, scale);
  if (resize.fit === "outside") return [width * scale, height * scale];
  return [resize.width ?? width * scale, resize.height ?? height * scale];
}

/**
 * Checks the source once, then renders each output in turn (sequential: bounded memory).
 * @throws {ImageTransformError} For a capped, unsupported or undecodable source, or an option sharp rejects.
 * @complexity O(outputs × pixels); each encode bounded by the pixel cap and timeout.
 */
export async function renderOutputs({ source, outputs }: { source: Buffer; outputs: readonly ImageOutput[] }, { limits = {} }: { limits?: Partial<ImageLimits> } = {}): Promise<RenderedImage[]> {
  const merged = { ...IMAGE_LIMITS, ...limits };
  const meta = await checkSource(source, merged);
  for (const output of outputs) checkOutputSize({ output, width: meta.autoOrient.width, height: meta.autoOrient.height, maxSide: merged.maxDimension });
  const rendered: RenderedImage[] = [];
  for (const output of outputs) {
    rendered.push(await renderOne(source, output, merged).catch((error: Error) => refuse(error instanceof ImageTransformError ? error.message : `${output.path}: ${error.message}`)));
  }
  return rendered;
}
