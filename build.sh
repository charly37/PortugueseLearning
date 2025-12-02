#!/bin/bash

# Portuguese Learning - Build Script
# This script builds the application without deploying

set -e  # Exit on error

echo "========================================"
echo "Portuguese Learning - Build Script"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}➜ $1${NC}"
}

# Install dependencies
print_info "Installing dependencies..."
npm ci
print_success "Dependencies installed"

# Build server
print_info "Building server..."
npm run build:server
print_success "Server built"

# Build client
print_info "Building client..."
npm run build:client
print_success "Client built"

echo ""
echo "========================================"
print_success "Build completed successfully!"
echo "========================================"
echo ""
echo "To run the application:"
echo "  npm start"
echo ""
echo "To build Docker image:"
echo "  docker build -t portuguese-learning ."
echo ""
echo "To deploy with Docker:"
echo "  ./deploy.sh"
echo ""
