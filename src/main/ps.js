const { execFile } = require("child_process");

function runPS(script) {
  return new Promise((resolve, reject) => {
    const psExe = "powershell.exe";

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ];

    execFile(psExe, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout || "").toString();
      const errOut = (stderr || "").toString();

      if (err) {
        // Include stderr for debugging
        const e = new Error(`${err.message}\n${errOut}`.trim());
        e.code = err.code;
        return reject(e);
      }

      resolve({ stdout: out, stderr: errOut });
    });
  });
}

module.exports = { runPS };