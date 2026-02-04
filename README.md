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
Tools for Xbox Fullscreen Experience optimization.\
Feature availability is automatically gated using real build + UBR detection.

🧹 **Registry Cleaner**\
Scan and repair Windows registry issues safely.

🧠 **Windows Scanner (Always Visible)**\
Persistent system information scanner displayed in the left sidebar under the TOS button.\
Shows Windows version, OS number, NT version, channel (Live / Insider), and build.\
Uses build-based detection to prevent Windows 11 being misidentified as Windows 10.

🧰 **Tools Installer System**\
Modular framework for installing third-party tools safely.\
Currently supports **ExplorerPatcher** (classic taskbar & shell behavior).\
Designed for future tools such as 7-Zip and Notepad++.

📦 **Dual Build System** - Installer Version - Portable Version

------------------------------------------------------------------------

## 🖥 Requirements

-   Windows 10 / 11 (Windows 11 is the primary target)
-   Node.js 18+
-   PowerShell (Built-in)

------------------------------------------------------------------------

## 🧪 Development Setup

```powershell
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

```cmd
npm run dist:nosign:cmd
```

### PowerShell

```powershell
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
-   Uses **robocopy + ExecWait** for stability\
-   OS detection is **build-based**, not NT-version based\
-   Feature gating relies on **build + UBR**, not OS name strings

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

### MIT License (Modified for Software / Game Repacks)

Copyright (c) 2023–2026 GR Studios AI LLC

Permission is hereby granted, free of charge, to any person obtaining a copy  
of this software and/or game repack and associated documentation files  
(the "Software/Game"), to deal in the Software/Game without restriction,  
including without limitation the rights to use, copy, modify, merge,  
publish, distribute, sublicense, and/or sell copies of the Software/Game,  
and to permit persons to whom the Software/Game is furnished to do so,  
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all  
copies or substantial portions of the Software/Game, including repacks,  
redistributions, and derived works.

THE SOFTWARE/GAME IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS  
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER  
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  
OUT OF OR IN CONNECTION WITH THE SOFTWARE/GAME OR THE USE OR OTHER DEALINGS  
IN THE SOFTWARE/GAME.
