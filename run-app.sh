#!/bin/bash

###############################################################################
# Loan Administration App - Development Run Script
# 
# This script runs the application in development mode.
# - Does NOT alter any database tables
# - Does NOT modify auth/login tables  
# - Does NOT run migrations
# - Starts the dev server on http://localhost:3000
###############################################################################

set -e

echo "=========================================="
echo "Loan Administration App - Starting..."
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install || yarn install || pnpm install
    echo ""
fi

# Check if .env.local exists
if [ ! -f ".env.local" ] && [ ! -f ".env.development.local" ]; then
    echo -e "${YELLOW}⚠️  Warning: No .env.local or .env.development.local file found${NC}"
    echo "Make sure you have configured your environment variables in:"
    echo "  - .env.local, or"
    echo "  - .env.development.local"
    echo ""
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""
echo -e "${YELLOW}Starting development server...${NC}"
echo "The app will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

# Start the development server
npm run dev

