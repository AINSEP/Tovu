import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Runner-only switch; never copied into the app's scrubbed environment. */
export const IS_PACKAGED_DESKTOP = Boolean(process.env.TOVU_DESKTOP_E2E_APP);

interface PackagedDesktopApp {
  inputPath: string;
  bundlePath: string;
  executablePath: string;
  version: string;
  payloadRoot: string;
}

/** Read XML or binary plists with macOS's own reader rather than assuming an XML layout. */
function plistString(plistPath: string, key: string): string {
  try {
    const value = execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath], { encoding: "utf8" }).trim();
    if (!value) throw new Error("empty value");
    return value;
  } catch (cause) {
    throw new Error(`desktop journeys: cannot read ${key} from ${plistPath}.`, { cause });
  }
}

/** Resolve the released Tovu bundle, whether the runner names its .app or its MacOS binary. */
export function resolvePackagedDesktopApp(
  { appPath }: { appPath: string },
  _optionalArgs: Record<string, never> = {},
): PackagedDesktopApp {
  const inputPath = path.resolve(appPath);
  const isBundle = path.extname(inputPath).toLowerCase() === ".app";
  const bundlePath = isBundle ? inputPath : path.resolve(inputPath, "..", "..", "..");
  if (path.extname(bundlePath).toLowerCase() !== ".app" ||
      (!isBundle && path.dirname(inputPath) !== path.join(bundlePath, "Contents", "MacOS"))) {
    throw new Error(`desktop journeys: TOVU_DESKTOP_E2E_APP must name a .app bundle or its Contents/MacOS binary: ${inputPath}`);
  }
  const plistPath = path.join(bundlePath, "Contents", "Info.plist");
  const executable = plistString(plistPath, "CFBundleExecutable");
  if (executable === "." || executable === ".." || path.basename(executable) !== executable) {
    throw new Error(`desktop journeys: invalid CFBundleExecutable in ${plistPath}: ${executable}`);
  }
  const executablePath = path.join(bundlePath, "Contents", "MacOS", executable);
  if (!isBundle && inputPath !== executablePath) {
    throw new Error(`desktop journeys: ${inputPath} is not the bundle's CFBundleExecutable (${executablePath}).`);
  }
  if (!fs.statSync(executablePath).isFile()) throw new Error(`desktop journeys: not an executable file: ${executablePath}`);
  fs.accessSync(executablePath, fs.constants.X_OK);
  return {
    inputPath,
    bundlePath,
    executablePath,
    version: plistString(plistPath, "CFBundleShortVersionString"),
    payloadRoot: path.join(bundlePath, "Contents", "Resources", "tovu"),
  };
}
