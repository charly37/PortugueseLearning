#!/bin/bash

# Portuguese Learning - CI/CD Deployment Script
# This script pulls and deploys the application using Docker

set -e  # Exit on error

echo "========================================"
echo "Portuguese Learning - Deployment Script"
echo "========================================"

# Configuration
IMAGE_NAME="charly37/portuguese-learning:latest"
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

# Stop and remove existing container if it exists
print_info "Stopping existing container if running..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true
print_success "Existing container stopped"

# Pull the latest image from Docker Hub
print_info "Pulling latest image from Docker Hub..."
docker pull $IMAGE_NAME
print_success "Image pulled successfully"

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

# Start the container
print_info "Starting the application..."
docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e MONGODB_URI="$MONGODB_URI" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  --restart unless-stopped \
  $IMAGE_NAME
print_success "Application started successfully"

# Wait for the application to be ready
print_info "Waiting for application to be ready..."
sleep 5

# Check if the container is running
if docker ps | grep -q $CONTAINER_NAME; then
    print_success "Container is running"
else
    print_error "Container failed to start"
    docker logs $CONTAINER_NAME
    exit 1
fi

# Test the application
print_info "Testing application health..."
if curl -f http://localhost:$PORT/api/health > /dev/null 2>&1; then
    print_success "Application is healthy and responding"
else
    print_error "Application health check failed"
    docker logs $CONTAINER_NAME
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
echo "  View logs:        docker logs -f $CONTAINER_NAME"
echo "  Stop app:         docker stop $CONTAINER_NAME"
echo "  Restart app:      docker restart $CONTAINER_NAME"
echo "  View status:      docker ps"
echo "  Remove app:       docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
echo ""
