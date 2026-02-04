/**
 * Stage the latest portable EXE from dist/ into build/portable/
 * so NSIS can embed it inside the installer.
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const distDir = path.join(root, "dist");
const outDir = path.join(root, "build", "portable");

function latestPortableExe() {
  if (!fs.existsSync(distDir)) return null;
  const files = fs.readdirSync(distDir);

  // Your portable artifact name is "GR Command Hub Portable.exe" in package.json.
  // We'll accept any EXE with "Portable" in the name as a fallback.
  const candidates = files
    .filter((f) => /\.exe$/i.test(f))
    .filter((f) => /portable/i.test(f));

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const mb = fs.statSync(path.join(distDir, b)).mtimeMs;
    const ma = fs.statSync(path.join(distDir, a)).mtimeMs;
    return mb - ma;
  });

  return path.join(distDir, candidates[0]);
}

fs.mkdirSync(outDir, { recursive: true });

const src = latestPortableExe();
if (!src) {
  console.error("Portable EXE not found in dist/. Build it first: npm run dist:portable");
  process.exit(1);
}

const dest = path.join(outDir, "GR Command Hub Portable.exe");
fs.copyFileSync(src, dest);
console.log("✅ Staged portable for installer:", dest);
