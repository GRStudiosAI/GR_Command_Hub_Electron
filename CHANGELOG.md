# Changelog

## [0.2.0] – Windows Scanner & Tools Hub Update

### ➕ Added
- **Persistent Windows Scanner** (always visible in left sidebar)
  - Displays real-time OS, version, channel, and build information
  - Positioned directly under the TOS button
- **Tools Installer System**
  - Modular framework for installing third-party tools
  - Designed for safe, on-demand installs
- **ExplorerPatcher Integration**
  - Installable through the Tools system
  - Enables classic taskbar and shell behavior on Windows 11
- **Modern Windows Version Awareness**
  - Support for 24H2 / 25H2
  - Insider channel detection (Canary, Dev, Beta, Release Preview)

---

### 🛠 Fixed
- Incorrect OS detection showing **Windows 10** on Windows 11 systems
- Broken build detection returning `0.0`
- Incorrect OS major value (`OS: 10`) on Windows 11
- Missing or incorrect DisplayVersion values
- Missing **WINDOWS SCANNER** title in sidebar
- NT version overriding real OS version in UI

---

### 🧠 Improved
- OS detection now uses **build number as source of truth**
  - `Build ≥ 22000 → Windows 11`
- OS version and edition detection fully decoupled
- Build reporting now shows **build.UBR**
- Scanner hardened against missing registry values
- Feature gating (Xbox FSE tools) preserved and stabilized

---

### 🛡 Stability & Safety
- No system components removed
- No Windows security features disabled
- No Windows Update breakage
- All changes are UI and detection level only
- Safe for Live and Insider builds
