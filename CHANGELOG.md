# Changelog

## [Unreleased] – Windows Scanner & Tools Hub Update

### ➕ Added
- **Persistent Windows Scanner** (always visible in left sidebar)
  - Displays real-time OS and system version information
  - Positioned directly under the TOS button
- **Tools Installer System**
  - New tools installation framework added to the app
  - Designed for safe, on-demand installation of third-party tools
- **ExplorerPatcher Integration**
  - Added as an installable tool via the Tools system
  - Enables classic taskbar and shell behavior on Windows 11
- **Windows Version Awareness**
  - Support for modern Windows versions (24H2 / 25H2)
  - Insider channel detection (Canary, Dev, Beta, Release Preview)

---

### 🛠 Fixed
- Incorrect OS detection showing **Windows 10** on Windows 11 systems
- Broken build detection returning `0.0`
- Incorrect OS major value (`OS: 10`) on Windows 11
- Missing or incorrect DisplayVersion values
- Windows Scanner title not appearing in sidebar
- Fallback logic that caused NT version to override real OS version

---

### 🧠 Improved
- Windows OS detection now uses **build number as the source of truth**
  - `Build ≥ 22000 → Windows 11`
- OS name detection no longer trusts NT version alone
- Edition detection (Pro / Home / Enterprise) separated from OS detection
- Build reporting now correctly shows **build.UBR**
- Windows Scanner hardened against missing registry values
- Feature gating logic (Xbox FSE tools) preserved and stabilized

---

### 🛡 Stability & Safety
- No system components removed
- No Windows security features disabled
- No changes affecting Windows Update
- All changes implemented at UI / detection level only
- Safe for both Live and Insider builds

---

## [0.1.0] – Initial Release
- Core Command Hub UI
- Windows Debloater
- Purge Engine
- Xbox FSE Toolkit
- Registry Cleaner
- Installer + Portable build system
