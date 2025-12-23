#!/bin/bash
# Database initialization script for Revas
# This script runs all migrations in order during container startup

set -e

echo "=== Revas Database Initialization ==="

# Wait for postgres to be ready
until pg_isready -U postgres; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL is ready!"

# Run migrations in order
MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"

if [ -d "$MIGRATIONS_DIR" ]; then
  echo "Running migrations from $MIGRATIONS_DIR..."

  for migration in $(ls -1 "$MIGRATIONS_DIR"/*.sql | sort); do
    echo "Applying: $(basename $migration)"
    psql -U postgres -d postgres -f "$migration"
  done

  echo "All migrations applied successfully!"
else
  echo "WARNING: Migrations directory not found at $MIGRATIONS_DIR"
  echo "Database will be empty. Mount migrations directory or copy SQL files."
fi

echo "=== Database initialization complete ==="
