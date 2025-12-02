# Installation
In vscode, install the extension `be5invis.vscode-custom-css` (Custom CSS and JS Loader)

Then follow the instructions on the extension to take over the Visual Studio Code's installation directory (check the Windows / Mac and Linux users sections)

Install the main extension file by doing the Command (Ctrl+Shift+P) `Extensions: Install from VSIX...` and select the `.vsix` file

Place the `custom.js` and `custom.css` somewhere easily accessible (like on the desktop)

add to your `settings.json` (Command `Preferences: Open User Settings (JSON)`):
```json
    "vscode_custom_css.imports": [
        "file://<path to>/custom.css",
        "file:///home/leo/Desktop/walking-pets/injected/custom.js" // for example
    ],
```

Nearly done, now do the command `Reload Custom CSS and JS`

And finally do the command `Developper: Reload Window`
