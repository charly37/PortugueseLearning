#!/bin/bash

# Portuguese Learning - CI/CD Deployment Script
# This script pulls and deploys the application using Docker Compose

set -e  # Exit on error

echo "========================================"
echo "Portuguese Learning - Deployment Script"
echo "========================================"

# Configuration
IMAGE_NAME="charly37/portuguese-learning:latest"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}➜ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if Docker and Docker Compose are installed
print_info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_success "Docker is installed"

print_info "Checking Docker Compose installation..."
if ! command -v docker compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_success "Docker Compose is installed"

# Check for required environment variables
print_info "Checking required environment variables..."
if [ -z "$MONGODB_URI" ]; then
    print_error "MONGODB_URI environment variable is not set"
    echo "Please set it with: export MONGODB_URI=your_mongodb_connection_string"
    exit 1
fi
if [ -z "$SESSION_SECRET" ]; then
    print_error "SESSION_SECRET environment variable is not set"
    echo "Please set it with: export SESSION_SECRET=your_secret_key"
    exit 1
fi
print_success "Required environment variables are set"

# Check if .env file exists, if not create it
print_info "Setting up .env file..."
cat > .env <<EOF
MONGODB_URI=${MONGODB_URI}
SESSION_SECRET=${SESSION_SECRET}
EOF
print_success ".env file created"

# Pull the latest app image from Docker Hub
print_info "Pulling latest app image from Docker Hub..."
docker compose pull app
print_success "Image pulled successfully"

# Restart only the app container (nginx stays running)
print_info "Restarting app container..."
docker compose up -d app
print_success "Application restarted successfully"

# Note: nginx container is not restarted to avoid downtime
# If you need to restart nginx (e.g., after config changes), run:
#   docker compose restart nginx

# Wait for the application to be ready
print_info "Waiting for application to be ready..."
sleep 5

# Check if containers are running
if docker compose ps | grep -q "Up"; then
    print_success "Containers are running"
else
    print_error "Containers failed to start"
    docker compose logs
    exit 1
fi

# Test nginx
print_info "Testing nginx..."
if curl -f http://localhost/nginx-health > /dev/null 2>&1; then
    print_success "Nginx is healthy"
else
    print_error "Nginx health check failed"
    docker compose logs nginx
    exit 1
fi

# Test the application
print_info "Testing application health..."
if curl -f http://localhost/api/health > /dev/null 2>&1; then
    print_success "Application is healthy and responding"
else
    print_error "Application health check failed"
    docker compose logs app
    exit 1
fi

echo ""
echo "========================================"
print_success "Deployment completed successfully!"
echo "========================================"
echo ""
echo "Application is running at: http://localhost"
echo "Nginx health check: http://localhost/nginx-health"
echo ""
echo "Useful commands:"
echo "  View all logs:        docker compose logs -f"
echo "  View nginx logs:      docker compose logs -f nginx"
echo "  View app logs:        docker compose logs -f app"
echo "  Stop all:             docker compose down"
echo "  Restart all:          docker compose restart"
echo "  Restart nginx:        docker compose restart nginx"
echo "  Restart app:          docker compose restart app"
echo "  View status:          docker compose ps"
echo ""
