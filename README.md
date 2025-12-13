# Portuguese Learning Website

A full-stack web application built with Express.js, TypeScript, and Material-UI.

## Features

- Express.js backend with TypeScript
- React frontend with Material-UI components
- Three interactive challenge types: Word, Verb, and Idiom challenges
- Development and production build configurations
- Hot reload for development
- Automated UI testing with Playwright
- Docker containerization with CI/CD pipeline

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## Installation

```bash
# Install project dependencies
npm install

# Install Playwright browsers and system dependencies (required for testing)
npx playwright install --with-deps chromium
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

## Testing

The project includes comprehensive UI testing with Playwright covering all challenge types.

### Running Tests

```bash
# Run tests in headless mode
npm test

# Run tests with visible browser
npm run test:headed

# Open Playwright UI for interactive testing
npm run test:ui

# View test report
npm run test:report
```

### Test Coverage

- Landing page navigation (3 tests)
- Word challenge functionality (6 tests)
- Verb challenge functionality (6 tests)
- Idiom challenge functionality (6 tests)

All tests run automatically in the CI/CD pipeline before building and deploying the Docker container.

## Available Scripts

- `npm run dev` - Run both server and client in development mode
- `npm run dev:server` - Run only the server in development mode
- `npm run dev:client` - Run only the client in development mode
- `npm run build` - Build both server and client for production
- `npm run build:server` - Build only the server
- `npm run build:client` - Build only the client
- `npm start` - Start the production server
- `npm test` - Run Playwright tests in headless mode
- `npm run test:headed` - Run tests with visible browser
- `npm run test:ui` - Open Playwright UI for interactive testing
- `npm run test:report` - View the latest test report
