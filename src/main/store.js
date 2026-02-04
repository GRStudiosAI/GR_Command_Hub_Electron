const fs = require("fs/promises");
const path = require("path");
const { app } = require("electron");

function storePaths() {
  const dir = path.join(app.getPath("userData"), "data");
  return {
    dir,
    regCleaner: path.join(dir, "reg_cleaner_found_issues.json")
  };
}

async function ensureDir() {
  const { dir } = storePaths();
  await fs.mkdir(dir, { recursive: true });
}

async function readJSON(file, fallback) {
  try {
    await ensureDir();
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJSON(file, obj) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf-8");
}

module.exports = { storePaths, readJSON, writeJSON };