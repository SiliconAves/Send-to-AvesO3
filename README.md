# 🐦 Send to AvesO3

A Firefox extension that sends AO3 fanfiction directly to your AvesO3 e-reader 
with a single click.

## Features

- **One-click transfer** from any AO3 work page 
- **Locked fic support**: uses your existing browser session
- **Folder mode**: browse your device's folder structure and send to any folder
- **Pin folders** for quick access to your most-used destinations
- **Auto-discovery**: finds your device automatically on the local network
- **Connection indicator**: badge on the toolbar icon shows device status when browsing AO3
- Supports **archiveofourown.org** and **archiveofourown.gay**

## Requirements

- Firefox Desktop or Firefox Nightly for Android
- AvesO3 1.5 and up installed on your xteink x3/x4
- eReader and browser on the same WiFi network
- http://crosspoint.local **added to HTTPS-Only Exceptions <-- IMPORTANT**

## How to Install - Firefox Nightly for Android

> [!IMPORTANT]
> Remember to turn off HTTPS-Only mode in Firefox settings. This setting on Android is global, you can't set an HTTPS-Only exception for crosspoint.local.

1. **Download the latest .xpi** file from this GitHub release page
2. On your Android phone, download and open Firefox Nightly. **Ensure HTTPS-Only mode is off in settings**
3. Open the Settings menu and scroll **all the way to the bottom**
4. Tap on **"About Firefox Nightly"**
5. **Repeatedly tap** on the Firefox logo until debug menus activate
6. Press Back. Under "Advanced" you should find **"Install extension from file"**
7. Select the .xpi file you want to install and follow the installation prompt

## How to Install - Firefox Desktop

> [!IMPORTANT]
> Remember to set http://crosspoint.local as an exception to Firefox HTTPS-Only mode.

1. **Download the latest .xpi** file from this GitHub release page
2. Open the .xpi file and follow the installation prompt
3. In the settings menu, set http://crosspoint.local as an HTTPS-Only exception

## How to Use

> [!IMPORTANT]
> Remember to set http://crosspoint.local as an exception to Firefox HTTPS-Only mode.

1. On your AvesO3 device, open **File Transfer** → **AvesO3 Receive** (Or set "Send to AvesO3" as the short power button action from Crosspoint settings)
2. The extension icon badge will turn **green** when your device is detected. Reload the page to update the connection status badge. 
3. Navigate to any AO3 work and click **🐦 Send to AvesO3**.
4. If you want to choose the folder, ensure you press "Fetch Folders from Device" at least once.

## Folder Mode

By default, fics are sent to the root folder of your device. To organise your epubs:

1. Click the extension icon to open the popup
2. Toggle **Folder mode** ON
3. Click **Fetch Folders from Device** (device must be in receive mode)
4. Browse your folder structure and **pin your favourite destinations**
5. The send button will show a **dropdown** with your pinned and recent folders