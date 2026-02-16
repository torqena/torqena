# Torqena

Torqena is an AI-powered desktop application for knowledge management, built with Electron, Vite, and the GitHub Copilot CLI SDK.

It provides a three-column workspace with a markdown editor (CodeMirror 6), AI-powered chat, and extensible skill system. Torqena can read, search, create, and organize notes in your vault, integrate with external tools via Model Context Protocol (MCP), and support custom workflows through agent skills.

## Features

- **AI-Powered Chat** — Converse with GitHub Copilot, attach notes for context, and receive streaming responses
- **Markdown Editor** — Full CodeMirror 6 editor with live preview, syntax highlighting, and frontmatter support
- **Vault Integration** — Read, search, create, modify, and organize notes
- **Extensible Skills** — Add custom tools and workflows the AI can invoke
- **MCP Support** — Integrate external tools, APIs, and automation via stdio and HTTP MCP servers
- **Multiple AI Providers** — GitHub Copilot (primary), OpenAI, and Azure OpenAI
- **Multiple Models** — GPT-4.1, GPT-4o, Claude, Gemini, and more
- **Extension Marketplace** — Browse and install community extensions
- **Voice Input** — Voice chat and real-time agent support
- **Automation** — Scheduled and triggered workflows

## Requirements

- **GitHub Copilot subscription** (Individual, Business, or Enterprise)
- **GitHub Copilot CLI** installed and authenticated
- **Node.js 20+**

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (Electron + Vite hot reload)
npm run dev:electron

# Build for production
npm run build:electron
```

See [AGENTS.md](AGENTS.md) for full architecture documentation and development guide.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev:electron` | Full Electron dev mode with hot reload |
| `npm run dev:shell` | Vite dev server only (renderer at localhost:5173) |
| `npm run build:shell` | Build renderer to `dist/` |
| `npm run build:electron` | Build + package desktop app |
| `npm run lint` | Lint all source files |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the [MIT](LICENSE) License.

## Author

Dan Shue — [GitHub](https://github.com/danielshue)