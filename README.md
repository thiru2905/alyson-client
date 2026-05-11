# Alyson HR Client

Modern ops + HR client built with **React** + **TanStack Start/Router** + **Vite**.

<p align="left">
  <a href="https://github.com/thiru2905/client"><img alt="Repo" src="https://img.shields.io/badge/GitHub-thiru2905%2Fclient-black?logo=github"></a>
  <a href="https://github.com/thiru2905/client/commits/main"><img alt="Commits" src="https://img.shields.io/github/commit-activity/m/thiru2905/client?logo=git"></a>
  <a href="https://github.com/thiru2905/client/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/thiru2905/client?logo=github"></a>
  <a href="https://github.com/thiru2905/client"><img alt="Last commit" src="https://img.shields.io/github/last-commit/thiru2905/client?logo=github"></a>
  <a href="https://github.com/thiru2905/client/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/thiru2905/client?style=flat&logo=github"></a>
  <img alt="Views" src="https://visitor-badge.laobi.icu/badge?page_id=thiru2905.client">
</p>

## Highlights

- **Time Dashboard**: real-time Time Doctor rollups + export
- **Bonus**: bonus allocation / simulation / approvals (role-gated)
- **Alyson Notetaker**: Recall.ai meeting bot + live transcript + notes

## Tech stack

- **App**: React 19, TypeScript
- **Routing**: TanStack Router / TanStack Start
- **Data**: TanStack React Query
- **UI**: Tailwind CSS v4, Radix UI, Lucide icons, Sonner toasts
- **Build**: Vite

## Getting started

### Prerequisites

- Node.js (LTS recommended)
- npm

### Install

```bash
npm install
```

### Configure env

This project loads env vars via `dotenv -e .env -- ...`.

- Copy/update `.env` as needed for your environment.

### Run

```bash
npm run dev
```

### Common scripts

```bash
npm run build
npm run preview
npm run lint
npm run format
```

## Project notes

- `src/routeTree.gen.ts` is **generated** by TanStack Router. Don’t edit it manually.

## License

If you intend to open-source this repo, add a `LICENSE` file and update this section.

