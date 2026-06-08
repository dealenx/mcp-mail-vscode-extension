import { execSync } from "node:child_process";
import { existsSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..");
const TMP = resolve(MONOREPO_ROOT, ".vsix-packaging-tmp");

const nmBun = resolve(ROOT, "node_modules");
const nmBunBak = resolve(TMP, "node_modules.bun.bak");
const pkgLock = resolve(ROOT, "package-lock.json");

console.log("[package] VSIX root:", ROOT);
console.log("[package] Monorepo root:", MONOREPO_ROOT);

if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

console.log("[package] Saving bun node_modules...");
if (existsSync(nmBunBak)) rmSync(nmBunBak, { recursive: true, force: true });
if (existsSync(nmBun)) {
  cpSync(nmBun, nmBunBak, { recursive: true });
  rmSync(nmBun, { recursive: true, force: true });
}

try {
  console.log("[package] Installing all dependencies with npm...");
  execSync("npm install", { cwd: ROOT, stdio: "inherit" });

  console.log("[package] Packaging .vsix...");
  execSync("npx vsce package --allow-missing-repository", { cwd: ROOT, stdio: "inherit" });
} finally {
  console.log("[package] Cleaning npm artifacts...");
  if (existsSync(pkgLock)) rmSync(pkgLock, { force: true });

  console.log("[package] Restoring bun node_modules...");
  if (existsSync(nmBun)) rmSync(nmBun, { recursive: true, force: true });
  if (existsSync(nmBunBak)) {
    cpSync(nmBunBak, nmBun, { recursive: true });
    rmSync(nmBunBak, { recursive: true, force: true });
  }

  console.log("[package] Cleaning temp directory...");
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

console.log("[package] Done!");