# Revas Docker Deployment

This directory contains everything needed to deploy the Revas application stack using Docker.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Docker Host                     │
                    │                                              │
  Users ──────────► │  ┌──────────┐      ┌───────────────────┐   │
        Port 80     │  │  nginx   │      │  Supabase Stack   │   │
                    │  │(frontend)│ ───► │                   │   │
                    │  └──────────┘      │  Kong (:8000)     │   │
                    │                    │  PostgreSQL       │   │
  Admins ─────────► │                    │  Auth (GoTrue)    │   │
        Port 3000   │  ┌──────────┐      │  REST (PostgREST) │   │
                    │  │  Studio  │ ───► │  Edge Functions   │   │
                    │  └──────────┘      │                   │   │
                    └────────────────────┴───────────────────┘   │
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  External Comment Service     │
                              │  (configured via env var)     │
                              └───────────────────────────────┘
```

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 4GB RAM available for containers

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Critical settings to change:**
- `POSTGRES_PASSWORD` - Database password
- `JWT_SECRET` - Secret for signing tokens (min 32 chars)
- `ANON_KEY` - Public API key (JWT token)
- `SERVICE_ROLE_KEY` - Admin API key (JWT token)
- `COMMENT_SERVICE_URL` - URL to your comment service backend

### 3. Generate JWT Tokens

The `ANON_KEY` and `SERVICE_ROLE_KEY` are JWT tokens signed with your `JWT_SECRET`.

**Using Node.js:**
```bash
node -e "
const jwt = require('jsonwebtoken');
const secret = 'your-jwt-secret-min-32-chars';
console.log('ANON_KEY:', jwt.sign({role:'anon',iss:'supabase'}, secret, {expiresIn:'10y'}));
console.log('SERVICE_ROLE_KEY:', jwt.sign({role:'service_role',iss:'supabase'}, secret, {expiresIn:'10y'}));
"
```

**Or use https://jwt.io:**
1. Set algorithm to HS256
2. Use your JWT_SECRET as the secret
3. For ANON_KEY payload: `{"role":"anon","iss":"supabase","exp":1892614400}`
4. For SERVICE_ROLE_KEY payload: `{"role":"service_role","iss":"supabase","exp":1892614400}`

### 4. Update Kong API Gateway Keys

**Important:** For production, update the API keys in `kong/kong.yml`:

```bash
nano kong/kong.yml
```

Find the `consumers` section and replace the demo keys with your generated tokens:
```yaml
consumers:
  - username: ANON
    keyauth_credentials:
      - key: YOUR_ANON_KEY_HERE
  - username: SERVICE_ROLE
    keyauth_credentials:
      - key: YOUR_SERVICE_ROLE_KEY_HERE
```

These keys must match the `ANON_KEY` and `SERVICE_ROLE_KEY` in your `.env` file.

### 5. Build and Start

```bash
# Build and start all services
docker-compose up -d --build

# IMPORTANT: Wait for database to be healthy, then set service passwords
# (This is needed because Supabase creates roles after the init scripts run)
sleep 30
docker-compose exec -e PGPASSWORD=postgres db psql -U supabase_admin -d postgres -c "
ALTER USER supabase_auth_admin WITH PASSWORD 'postgres';
ALTER USER supabase_storage_admin WITH PASSWORD 'postgres';
ALTER USER authenticator WITH PASSWORD 'postgres';
"

# Restart services to use new passwords
docker-compose restart auth rest

# Run application migrations
cd .. && for f in supabase/migrations/*.sql; do
  echo "Running $f..."
  docker-compose -f docker/docker-compose.yml exec -T -e PGPASSWORD=postgres db psql -U postgres -d postgres < "$f"
done && cd docker

# Restart REST to reload schema cache
docker-compose restart rest

# View logs
docker-compose logs -f

# Check service health
docker-compose ps
```

**Note:** Replace `'postgres'` with your actual `POSTGRES_PASSWORD` value.

### 6. Verify Deployment

- **Frontend**: http://localhost
- **Supabase API**: http://localhost:8000
- **Studio (Admin)**: http://localhost:3000

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 80 | React application (nginx) |
| kong | 8000 | API Gateway |
| studio | 3000 | Supabase Admin UI |
| db | 5432 | PostgreSQL database |
| auth | - | Authentication service |
| rest | - | REST API (PostgREST) |
| edge-runtime | - | Serverless functions |
| pg-meta | - | Database introspection for Studio |

## Configuration

### Environment Variables

See `.env.example` for all available options. Key settings:

| Variable | Description |
|----------|-------------|
| `SITE_URL` | Public URL of your frontend |
| `API_EXTERNAL_URL` | Public URL of Supabase API |
| `COMMENT_SERVICE_URL` | Backend comment service URL |
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | Secret for signing JWTs |
| `ANON_KEY` | Public API key |
| `SERVICE_ROLE_KEY` | Admin API key |

### Comment Service Backend

The comment service is external to this deployment. Configure its URL:

```bash
# If running on the same host
COMMENT_SERVICE_URL=http://host.docker.internal:8888

# If running on a different server
COMMENT_SERVICE_URL=http://your-server:8888
```

### Email Configuration (Optional)

To enable password reset and email verification:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_ADMIN_EMAIL=admin@example.com
```

## Operations

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f db
docker-compose logs -f kong
```

### Restarting Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart frontend
```

### Updating

```bash
# Pull latest images
docker-compose pull

# Rebuild and restart
docker-compose up -d --build
```

### Backup Database

```bash
# Create backup
docker-compose exec db pg_dump -U postgres postgres > backup.sql

# Restore backup
docker-compose exec -T db psql -U postgres postgres < backup.sql
```

### Reset Database

```bash
# Stop services
docker-compose down

# Remove database volume (WARNING: destroys all data)
docker volume rm docker_db-data

# Start fresh
docker-compose up -d
```

## Admin Operations

### Export Session Data

Export all review sessions with decrypted content:

```bash
# From project root directory
VITE_SUPABASE_URL=http://localhost:8000 \
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY> \
npm run export:sessions
```

### Generate Interaction Report

Generate a report analyzing reviewer interactions with comments:

```bash
VITE_SUPABASE_URL=http://localhost:8000 \
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY> \
npm run report:interactions
```

### Export User Tables (HTML format)

Export review data in HTML format:

```bash
VITE_SUPABASE_URL=http://localhost:8000 \
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY> \
npm run export:mytables
```

### Direct Database Export

For raw database access:

```bash
# Export all data via admin function
docker-compose exec -e PGPASSWORD=postgres db psql -U postgres -d postgres -c \
  "SELECT admin_view_all_tables();" > export.json

# Backup entire database
docker-compose exec db pg_dump -U postgres postgres > backup.sql
```

**Note:** Replace `<YOUR_SERVICE_ROLE_KEY>` with the value from your `.env` file. For local testing with demo keys:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

## Troubleshooting

### Services not starting

Check logs for specific errors:
```bash
docker-compose logs db
docker-compose logs kong
docker-compose logs auth
```

### Database connection issues

Ensure PostgreSQL is healthy:
```bash
docker-compose exec db pg_isready -U postgres
```

### Frontend can't reach API

1. Verify Kong is healthy: `docker-compose ps kong`
2. Check CORS headers in Kong config
3. Verify `API_EXTERNAL_URL` matches the actual URL

### Comment service not working

1. Check Edge Function logs: `docker-compose logs edge-runtime`
2. Verify `COMMENT_SERVICE_URL` is accessible from Docker network
3. For host services, use `host.docker.internal` instead of `localhost`

### Authentication issues

1. Verify JWT tokens are correctly generated with the same `JWT_SECRET`
2. Check GoTrue logs: `docker-compose logs auth`
3. Ensure `SITE_URL` matches your frontend URL

## Security Notes

For production deployment:

1. **Change all default passwords and secrets**
2. **Use HTTPS** - Configure SSL termination (nginx or reverse proxy)
3. **Restrict database access** - Don't expose port 5432 publicly
4. **Protect Studio** - Restrict access to port 3000 or disable in production
5. **Review CORS settings** - Update Kong config for your domains
6. **Enable rate limiting** - Configure in Kong if needed

## File Structure

```
docker/
├── docker-compose.yml    # Main orchestration file
├── Dockerfile.frontend   # Frontend build
├── nginx.conf            # Nginx configuration
├── .env.example          # Environment template
├── .env                  # Your configuration (not committed)
├── .env.local            # Local testing configuration
├── kong/
│   └── kong.yml          # API gateway routes
└── README.md             # This file

supabase/functions/
├── main/
│   └── index.ts          # Edge function router
└── get-comments/
    └── index.ts          # Comment service proxy function
```
