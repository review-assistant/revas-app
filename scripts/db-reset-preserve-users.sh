#!/bin/bash
# Database reset script that preserves user accounts
# Usage: ./scripts/db-reset-preserve-users.sh
#
# Prerequisites:
#   - Local Supabase must be running (npx supabase start)
#   - Docker must be running (psql runs inside the Supabase container)

set -e

BACKUP_DIR="supabase/.user-backup"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Find the Supabase postgres container
DB_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i supabase | grep -i db | head -1)

if [ -z "$DB_CONTAINER" ]; then
    echo "Error: Cannot find Supabase database container. Is Supabase running?"
    echo "  Run: npx supabase start"
    exit 1
fi

# Helper function to run psql in the container
run_psql() {
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres "$@"
}

echo "=== Database Reset (Preserving Users) ==="
echo "Using container: $DB_CONTAINER"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Step 1: Export users before reset
echo "Step 1: Backing up users..."

# Count users
USER_COUNT=$(run_psql -t -c "SELECT COUNT(*) FROM auth.users" | tr -d ' \n')
echo "  Found $USER_COUNT user(s) to backup"

if [ "$USER_COUNT" -eq "0" ] || [ -z "$USER_COUNT" ]; then
    echo "  No users to backup - proceeding with normal reset"
    echo ""
    npx supabase db reset --local
    echo ""
    echo "=== Reset complete! ==="
    exit 0
fi

# Export auth.users to CSV (via container stdout)
echo "  Exporting auth.users..."
run_psql -c "\COPY auth.users TO STDOUT WITH (FORMAT csv, HEADER true)" > "$BACKUP_DIR/auth_users_$TIMESTAMP.csv"

# Export public.profiles to CSV
echo "  Exporting public.profiles..."
run_psql -c "\COPY public.profiles TO STDOUT WITH (FORMAT csv, HEADER true)" > "$BACKUP_DIR/profiles_$TIMESTAMP.csv"

echo "  Saved to $BACKUP_DIR/*_$TIMESTAMP.csv"

# Step 2: Reset the database
echo ""
echo "Step 2: Resetting database (this runs migrations)..."
npx supabase db reset --local

# Wait a moment for the database to be ready after reset
sleep 2

# Step 3: Restore users
echo ""
echo "Step 3: Restoring users..."

# Restore auth.users (COPY fires triggers which create empty profiles)
echo "  Restoring auth.users..."
cat "$BACKUP_DIR/auth_users_$TIMESTAMP.csv" | run_psql -c "\COPY auth.users FROM STDIN WITH (FORMAT csv, HEADER true)"

# Delete the auto-created empty profiles (trigger creates them with empty names)
echo "  Clearing auto-generated profiles..."
run_psql -c "DELETE FROM public.profiles;" > /dev/null

# Restore public.profiles with the actual data
echo "  Restoring public.profiles..."
cat "$BACKUP_DIR/profiles_$TIMESTAMP.csv" | run_psql -c "\COPY public.profiles FROM STDIN WITH (FORMAT csv, HEADER true)"

# Verify restoration
RESTORED_COUNT=$(run_psql -t -c "SELECT COUNT(*) FROM auth.users" | tr -d ' \n')
PROFILE_COUNT=$(run_psql -t -c "SELECT COUNT(*) FROM public.profiles" | tr -d ' \n')
echo "  Restored $RESTORED_COUNT user(s) and $PROFILE_COUNT profile(s)"

# Cleanup old backups (keep last 5)
echo ""
echo "Cleaning up old backups (keeping last 5)..."
ls -t "$BACKUP_DIR"/auth_users_*.csv 2>/dev/null | tail -n +6 | xargs rm 2>/dev/null || true
ls -t "$BACKUP_DIR"/profiles_*.csv 2>/dev/null | tail -n +6 | xargs rm 2>/dev/null || true

echo ""
echo "=== Reset complete! ==="
echo "Users preserved. Backup files in: $BACKUP_DIR/"
