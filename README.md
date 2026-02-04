# 🦇 GR Command Hub

> ⚡ Ultimate Windows Optimization & Toolkit Suite\
> Built by **GR Studios**

------------------------------------------------------------------------

## 🚀 Features

✨ **Windows Debloater**\
Remove unnecessary Windows components and background services.

🔥 **Purge Engine**\
Deep system cleaning and performance tuning.

🎮 **Xbox FSE Toolkit**\
Tools for Xbox Fullscreen Experience optimization.

🧹 **Registry Cleaner**\
Scan and repair Windows registry issues safely.

📦 **Dual Build System** - Installer Version - Portable Version

------------------------------------------------------------------------

## 🖥 Requirements

-   Windows 10 / 11
-   Node.js 18+
-   PowerShell (Built-in)

------------------------------------------------------------------------

## 🧪 Development Setup

``` powershell
npm install
npm start
```

------------------------------------------------------------------------

## 🏗 Build Outputs

### 🧾 Installer Version

Location:

    dist/GR Command Hub Setup.exe

✔ NSIS Installer\
✔ Custom install location\
✔ Desktop shortcut option\
✔ Uninstall entry

------------------------------------------------------------------------

### 📁 Portable Version

Locations:

    dist/GR Command Hub Portable.exe
    public/GR Command Hub Portable.exe

✔ No installation required\
✔ Runs from any folder\
✔ Optional internal shortcut

------------------------------------------------------------------------

## 🔧 Build Commands (No Signing)

### CMD

``` cmd
npm run dist:nosign:cmd
```

### PowerShell

``` powershell
npm run dist:nosign:ps
```

------------------------------------------------------------------------

## ⚙ Installer Options

During installation users can select:

-   📁 Portable extraction mode
-   🖥 Desktop shortcut creation

------------------------------------------------------------------------

## 📂 Project Structure

    dist/        → Built installer + portable EXEs
    public/      → Public portable release copy
    src/         → Electron source
    build/       → NSIS installer customization

------------------------------------------------------------------------

## 🧠 Technical Notes

-   System changes run via **PowerShell (Admin required)**\
-   Live logs stream directly into the UI terminal\
-   Portable build auto copies into `public` folder\
-   Uses **robocopy + ExecWait** for stability

------------------------------------------------------------------------

## 🛠 Troubleshooting

### ❌ Signing Errors

Signing is disabled by default.\
Windows SDK & certificates are only required if signing is enabled.

------------------------------------------------------------------------

### ❌ Portable Build Missing

Verify file exists:

    scripts/copy-portable-to-public.js

------------------------------------------------------------------------

### ❌ Installer Options Missing

Verify:

    build/installer.nsh

Is referenced using:

    nsis.include

NOT:

    nsis.script

------------------------------------------------------------------------

## 🦇 GR Studios

Built with passion, performance, and control in mind.

------------------------------------------------------------------------

## 📜 License

UNLICENSED
