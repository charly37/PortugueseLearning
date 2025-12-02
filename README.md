# Portuguese Learning Website

A full-stack web application built with Express.js, TypeScript, and Material-UI.

## Features

- Express.js backend with TypeScript
- React frontend with Material-UI components
- Development and production build configurations
- Hot reload for development

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## Installation

```bash
npm install
```

## Development

Run both the server and client in development mode:

```bash
npm run dev
```

- Backend server runs on: http://localhost:3000
- Frontend dev server runs on: http://localhost:8080

## Production Build

Build both server and client:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Project Structure

```
├── src/
│   ├── server.ts          # Express.js server
│   └── client/            # React frontend
│       ├── index.tsx      # React entry point
│       ├── App.tsx        # Main App component
│       └── index.html     # HTML template
├── dist/                  # Compiled server code
├── public/                # Built client assets
├── package.json
├── tsconfig.json          # TypeScript config for client
├── tsconfig.server.json   # TypeScript config for server
└── webpack.config.js      # Webpack configuration
```

## Available Scripts

- `npm run dev` - Run both server and client in development mode
- `npm run dev:server` - Run only the server in development mode
- `npm run dev:client` - Run only the client in development mode
- `npm run build` - Build both server and client for production
- `npm run build:server` - Build only the server
- `npm run build:client` - Build only the client
- `npm start` - Start the production server
