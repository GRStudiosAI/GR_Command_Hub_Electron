// src/main/tos.js

function getTosContent() {
  return {
    title: "TERMS OF SERVICE",
    effectiveDate: "January 2026",
    body: `
By installing or using GR Command Hub, you agree to the following terms.
If you do not agree, DO NOT USE this software.

1. NO WARRANTY
This software is provided "AS IS", without warranty of any kind, express or implied.

2. LIMITATION OF LIABILITY
GR Studios AI and TheBatGOD shall not be held liable for any damages,
including but not limited to data loss, system instability, or hardware failure.

3. USER RESPONSIBILITY
This application performs system-level changes.
You are solely responsible for reviewing and approving each action.

4. ADMINISTRATIVE PRIVILEGES
This software requires elevated privileges to function correctly.

5. ACCEPTANCE
Continued use of this software constitutes acceptance of these terms.
If you do not agree, discontinue use immediately.
`
  };
}

module.exports = {
  getTosContent
};
