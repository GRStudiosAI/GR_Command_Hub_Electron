// src/main/license.js
const fs = require("fs/promises");
const path = require("path");
const { app } = require("electron");

function getLicenseFilePath() {
  // Packaged: resources/assets/LICENSE
  if (app.isPackaged) return path.join(process.resourcesPath, "assets", "LICENSE");
  // Dev: project/assets/LICENSE
  return path.join(process.cwd(), "assets", "LICENSE");
}

async function readLicenseText() {
  const filePath = getLicenseFilePath();
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return text;
  } catch (e) {
    return `LICENSE file not found.\nExpected at:\n${filePath}\n\nError: ${e.message}`;
  }
}

module.exports = { readLicenseText };
