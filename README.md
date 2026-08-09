# Suvagoo

A simple web app for creating, viewing, and storing SVGs. Edit raw SVG markup in a code editor with live preview; files are persisted on the server filesystem.

## Stack

- **Client:** Vue 3, Vite, TypeScript, Sass, CodeMirror 6
- **Server:** Node.js, Express, TypeScript

## Setup

```bash
npm install
```

## Development

Runs the API server on port 3001 and the Vite dev server on port 5173 (API requests are proxied).

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Production

```bash
npm run build
npm start
```

The server listens on port 3001 and serves the built client plus the API.

## Storage

SVG files are stored under `server/data/svgs/`. Metadata (name, timestamps) lives in `server/data/index.json`.
