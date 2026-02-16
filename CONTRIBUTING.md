# Contributing to Torqena

Thank you for your interest in contributing to Torqena! This guide will help you get started.

## Getting Started

### Prerequisites

- **Node.js 20+**
- **npm**
- **GitHub Copilot CLI** installed and authenticated (for AI features)

### Setup

```bash
# Clone the repository
git clone https://github.com/danielshue/torqena.git
cd torqena

# Install dependencies
npm install

# Run in development mode
npm run dev:electron
```

### Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:electron` | Full Electron dev mode with Vite hot reload |
| `npm run dev:shell` | Vite dev server only (renderer at localhost:5173) |
| `npm run build:shell` | Build renderer to `dist/` |
| `npm run build:electron` | Build + package desktop app |
| `npm run lint` | Lint all source files |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Architecture

See [AGENTS.md](AGENTS.md) for full architecture documentation, coding conventions, and project structure.

**Key points:**
- **Electron 40** — Three-layer architecture (main process, preload bridge, Vite-bundled renderer)
- **Vite 5** — Bundles the renderer app with hot reload
- **TypeScript 5.8+** — Strict mode enabled
- **Vitest 4** — Test framework with V8 coverage

## Pull Request Process

1. Fork the repository and create your branch from `master`
2. Make your changes following the coding conventions in [AGENTS.md](AGENTS.md)
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Ensure linting passes: `npm run lint`
6. Update documentation if needed
7. Submit a pull request

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).