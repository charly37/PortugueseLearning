# Portuguese Learning Website

A full-stack web application built with Express.js, TypeScript, and Material-UI.

## Features

- Express.js backend with TypeScript
- React frontend with Material-UI components
- User authentication with registration and login
- MongoDB Atlas integration for user data storage
- Session management with secure cookies
- Three interactive challenge types: Word, Verb, and Idiom challenges
- Development and production build configurations
- Hot reload for development
- Automated UI testing with Playwright
- Docker containerization with CI/CD pipeline

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB Atlas account (free tier available at [mongodb.com](https://www.mongodb.com/cloud/atlas))

## Installation

```bash
# Install project dependencies
npm install

# Install Playwright browsers and system dependencies (required for testing)
npx playwright install --with-deps chromium
```

## Environment Setup

1. Copy the `.env.example` file to create a `.env` file:

```bash
cp .env.example .env
```

2. Update the `.env` file with your MongoDB Atlas credentials:

```env
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@cluster0.kn6sc.mongodb.net/?appName=Cluster0
SESSION_SECRET=your-secret-key-change-in-production
NODE_ENV=development
PORT=3000
```

Replace `<db_username>` and `<db_password>` with your actual MongoDB Atlas credentials.

### MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account or sign in
3. Create a new cluster (free tier is sufficient)
4. Create a database user with username and password
5. Add your IP address to the IP whitelist (or allow access from anywhere for development: 0.0.0.0/0)
6. Get your connection string from the "Connect" button
7. Replace `<db_username>` and `<db_password>` in your `.env` file

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
│   ├── config/
│   │   └── database.ts    # MongoDB connection
│   ├── models/
│   │   └── User.ts        # User model
│   ├── routes/
│   │   └── auth.ts        # Authentication routes
│   └── client/            # React frontend
│       ├── index.tsx      # React entry point
│       ├── App.tsx        # Main App component with auth state
│       ├── components/
│       │   ├── LoginPage.tsx       # Login page
│       │   ├── RegisterPage.tsx    # Registration page
│       │   ├── LandingPage.tsx     # Home page with user info
│       │   ├── ChallengePage.tsx   # Word challenges
│       │   ├── VerbChallengePage.tsx
│       │   └── IdiomChallengePage.tsx
│       └── index.html     # HTML template
├── data/                  # Challenge data
├── dist/                  # Compiled server code
├── public/                # Built client assets
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
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

## Docker Deployment

### Building and Running with Docker

```bash
# Build the Docker image
docker build -t portuguese-learning .

# Run the container (requires environment variables)
docker run -d \
  --name portuguese-learning-app \
  -p 3000:3000 \
  -e MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.mongodb.net/portuguese-learning" \
  -e SESSION_SECRET="your-secure-random-secret" \
  portuguese-learning:latest
```

### Automated Deployment Script

The project includes a deployment script that pulls the latest Docker image and starts the application:

```bash
# Set required environment variables first
export MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.mongodb.net/portuguese-learning"
export SESSION_SECRET="your-secure-random-secret"

# Run the deployment script
./deploy.sh
```

**Important:** The deployment script requires `MONGODB_URI` and `SESSION_SECRET` environment variables to be set before running. The script will check for these variables and fail with a helpful error message if they're missing.

### Docker Compose (with MongoDB)

Alternatively, use Docker Compose to run both the application and MongoDB locally:

```bash
# Start both services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

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
