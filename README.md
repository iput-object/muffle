# muffle

> Muffle the background, give the build the CPU.

A small Linux desktop app that lists what's running, turns startup on and off,
and switches whole **groups** of services and apps off and back on in one
click. For example, turn "Heavy stuff" off while doing Node.js dev and back on
afterwards.

Linux only (systemd). Built with Tauri 2 and React.

## Features

- **Running**: every running service and app with live CPU and RAM. Stop,
  start or pause any of them. Core system units are protected.
- **Groups**: put services and apps in a group, then muffle it (stop, pause or
  kill them all) and restore it later. muffle only brings back what it turned off,
  even after a restart. A unit can be in several groups: it only goes off once
  every group it's in is muffled, and comes back as soon as one is restored.
- **Startup**: turn login apps and boot services on or off.
- **Tray**: muffle and restore groups without opening the window.
- **CLI**: the same binary works from the terminal.
- **Light**: refreshes only while the window is open; idle in the tray.

## Install

Download the AppImage, `.deb` or `.rpm` from the
[latest release](https://github.com/iput-object/muffle/releases/latest).
On Arch, install `muffle-bin` from the AUR.

muffle updates itself from Settings → Updates.

## CLI

```
muffle                 open the app
muffle --hidden        start in the tray
muffle list            running units with CPU and RAM
muffle groups          groups and whether they're muffled
muffle status          muffled groups only
muffle off <group>     stop (or pause) the group
muffle on <group>      restore what muffle stopped
```

Example in fish: `muffle off heavy; and pnpm dev`

## Files

- `~/.config/muffle/config.toml`: groups and settings (hand-editable).
- `~/.local/state/muffle/state.json`: what muffle turned off, so it can undo it.

## Develop

```
pnpm install
pnpm tauri dev
```

Release: bump the version in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`, then push a `v*` tag. The workflow builds,
signs and publishes the release with the updater manifest.

## License

GPL-3.0
