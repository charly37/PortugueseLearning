#!/bin/bash

# Portuguese Learning - CI/CD Deployment Script
# This script builds and deploys the application using Docker

set -e  # Exit on error

echo "========================================"
echo "Portuguese Learning - Deployment Script"
echo "========================================"

# Configuration
IMAGE_NAME="portuguese-learning"
CONTAINER_NAME="portuguese-learning-app"
PORT=3000

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

# Check if Docker is installed
print_info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_success "Docker is installed"

# Check if Docker Compose is installed
print_info "Checking Docker Compose installation..."
if ! command -v docker compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_success "Docker Compose is installed"

# Stop and remove existing container if it exists
print_info "Stopping existing container if running..."
docker compose down 2>/dev/null || true
print_success "Existing container stopped"

# Pull the latest image from Docker Hub
print_info "Pulling latest image from Docker Hub..."
docker pull charly37/portuguese-learning:latest
print_success "Image pulled successfully"

# Start the container
print_info "Starting the application..."
docker compose up -d
print_success "Application started successfully"

# Wait for the application to be ready
print_info "Waiting for application to be ready..."
sleep 5

# Check if the container is running
if docker ps | grep -q $CONTAINER_NAME; then
    print_success "Container is running"
else
    print_error "Container failed to start"
    docker compose logs
    exit 1
fi

# Test the application
print_info "Testing application health..."
if curl -f http://localhost:$PORT/api/health > /dev/null 2>&1; then
    print_success "Application is healthy and responding"
else
    print_error "Application health check failed"
    docker compose logs
    exit 1
fi

echo ""
echo "========================================"
print_success "Deployment completed successfully!"
echo "========================================"
echo ""
echo "Application is running at: http://localhost:$PORT"
echo ""
echo "Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  Stop app:         docker compose down"
echo "  Restart app:      docker compose restart"
echo "  View status:      docker compose ps"
echo ""
