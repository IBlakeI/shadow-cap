# shadow-cap

An Electron application with React and TypeScript

This application allows you to create a screen record buffer and save the last X amount of minutes.

### Settings

You can customize:

- The output file location
- The quality based on 3 presets
- The keybinds for screenshotting, saving the buffer, and starting to record
- The buffer duration (up to 30min)

![Demo](./resources/shadow-cap.png)

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```
