#!/bin/bash
set -e

echo "🔄 Running database migrations..."
echo ""

# Check if drizzle-kit is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Please install pnpm first."
    exit 1
fi

# Check database connection
echo "Checking database connection..."
if ! PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT 1" &> /dev/null; then
    echo "❌ Cannot connect to database. Please check your environment variables:"
    echo "   DATABASE_HOST=$DATABASE_HOST"
    echo "   DATABASE_PORT=$DATABASE_PORT"
    echo "   DATABASE_USER=$DATABASE_USER"
    echo "   DATABASE_NAME=$DATABASE_NAME"
    exit 1
fi

echo "✓ Database connection successful"
echo ""

# Run migrations
echo "Applying migrations..."
pnpm drizzle-kit push

echo ""
echo "✓ Migrations completed successfully!"
echo ""
echo "📊 Current database tables:"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "\dt"

