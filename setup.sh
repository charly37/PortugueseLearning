#!/bin/bash

# Setup script for Portuguese Learning with Authentication

echo "🚀 Setting up Portuguese Learning Website with User Authentication"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit the .env file and add your MongoDB credentials:"
    echo "   - Replace <db_username> with your MongoDB username"
    echo "   - Replace <db_password> with your MongoDB password"
    echo ""
    echo "Press Enter to continue after updating .env file..."
    read
else
    echo "✅ .env file already exists"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building the project..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  npm start         (production mode)"
echo "  npm run dev       (development mode with hot reload)"
echo ""
echo "The application will be available at http://localhost:3000"
echo ""
echo "📚 Authentication Features:"
echo "  - Register new users at the registration page"
echo "  - Login with email and password"
echo "  - View your username on the landing page"
echo "  - Logout to end your session"
