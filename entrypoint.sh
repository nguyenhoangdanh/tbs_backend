#!/bin/sh
set -e

echo "🚀 Starting TBS Management Backend..."

# Run Prisma migrations
echo "🔄 Running database migrations..."
if node_modules/prisma/bin/prisma.js migrate deploy; then
  echo "✅ Migrations applied"
else
  echo "⚠️  Migration failed — continuing anyway (DB may already be up to date)"
fi

# Start the application
echo "▶️  Starting application on port ${PORT:-8080}..."
exec node dist/src/main.js
