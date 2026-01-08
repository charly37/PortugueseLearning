#!/bin/bash

# Portuguese Learning - Version Management Script
# Helper script to view and manage deployed versions

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}========================================"
    echo -e "$1"
    echo -e "========================================${NC}"
}

print_info() {
    echo -e "${YELLOW}➜ $1${NC}"
}

print_version() {
    echo -e "${CYAN}$1${NC}"
}

# Show current running version
show_current() {
    print_header "Current Running Version"
    echo ""
    docker compose ps --format "table {{.Service}}\t{{.Image}}\t{{.Status}}"
    echo ""
}

# Show deployment history
show_history() {
    print_header "Deployment History"
    echo ""
    if [ -f "deployments.log" ]; then
        tail -20 deployments.log
    else
        echo "No deployment history found."
    fi
    echo ""
}

# Show available versions on Docker Hub
show_available() {
    print_header "Available Versions on Docker Hub"
    echo ""
    print_info "Fetching available tags..."
    
    # Note: This requires curl and jq. You may need to install jq: apt-get install jq
    if command -v jq &> /dev/null; then
        APP_TAGS=$(curl -s "https://registry.hub.docker.com/v2/repositories/charly37/portuguese-learning/tags?page_size=25" | jq -r '.results[].name' | grep -v "latest" | head -10)
        echo "Recent app versions:"
        echo "${APP_TAGS}" | while read tag; do
            print_version "  - ${tag}"
        done
    else
        echo "Install 'jq' to see available versions: apt-get install jq"
        echo "Or visit: https://hub.docker.com/r/charly37/portuguese-learning/tags"
    fi
    echo ""
}

# Show help
show_help() {
    echo "Portuguese Learning - Version Management"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  current     Show currently running version"
    echo "  history     Show deployment history"
    echo "  available   Show available versions on Docker Hub"
    echo "  all         Show all information"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 current              # Show current version"
    echo "  $0 history              # Show deployment history"
    echo "  IMAGE_TAG=abc1234 ./deploy.sh  # Deploy specific version"
    echo ""
}

# Main logic
case "${1:-all}" in
    current)
        show_current
        ;;
    history)
        show_history
        ;;
    available)
        show_available
        ;;
    all)
        show_current
        show_history
        show_available
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
