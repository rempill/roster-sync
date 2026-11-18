import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const config = {
  // Standalone tracing uses symlinks that require extra privileges on Windows.
  // Docker/Linux gets the standalone server; Windows uses `next start`.
  output: process.platform === "win32" ? undefined : "standalone",
  outputFileTracingRoot: path.join(directory, "../.."),
  poweredByHeader: false,
  experimental: { cpus: 2 },
};
export default config;
