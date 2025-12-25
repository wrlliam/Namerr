#!/bin/bash

# Namerr Setup Script
# This script automates the setup process for development

set -e  # Exit on error

echo "========================================="
echo "Namerr Setup Script"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${BLUE}Creating .env.local from .env.example...${NC}"
    cp .env.example .env.local
    echo -e "${GREEN}✓ Created .env.local${NC}"
    echo ""
    echo -e "${RED}IMPORTANT: Edit .env.local and set:${NC}"
    echo "  - BETTER_AUTH_SECRET (run: openssl rand -base64 32)"
    echo "  - DATABASE_URL (if not using default)"
    echo ""
else
    echo -e "${GREEN}✓ .env.local already exists${NC}"
fi

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
bun install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Install worker dependencies
echo -e "${BLUE}Installing worker dependencies...${NC}"
cd worker && bun install && cd ..
echo -e "${GREEN}✓ Worker dependencies installed${NC}"
echo ""

# Start PostgreSQL with Docker Compose
echo -e "${BLUE}Starting PostgreSQL...${NC}"
if docker ps --format '{{.Names}}' | grep -q "namerr-postgres"; then
    echo -e "${GREEN}✓ PostgreSQL already running${NC}"
else
    echo "Starting PostgreSQL container..."
    docker compose up -d postgres

    echo "Waiting for PostgreSQL to be ready..."
    timeout=30
    elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if docker compose exec -T postgres pg_isready -U mediamanager > /dev/null 2>&1; then
            echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    if [ $elapsed -eq $timeout ]; then
        echo -e "${RED}✗ PostgreSQL failed to start in time${NC}"
        exit 1
    fi
fi
echo ""

# Push database schema
echo -e "${BLUE}Pushing database schema...${NC}"
bun run db:push
echo -e "${GREEN}✓ Database schema created${NC}"
echo ""

# Seed database
echo -e "${BLUE}Seeding database...${NC}"
bun run db:seed
echo -e "${GREEN}✓ Database seeded${NC}"
echo ""

# All done!
echo "========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env.local and set BETTER_AUTH_SECRET"
echo "  2. Run: bun run dev"
echo "  3. Run worker: bun run worker:dev (in another terminal)"
echo "  4. Visit: http://localhost:3000"
echo ""
echo "Default admin credentials:"
echo "  Email: admin@namerr.app"
echo "  Password: admin123"
echo ""
