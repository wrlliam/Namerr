> [!WARNING]
> **Namerr is in very early alpha and is not fully production ready, if you wish to run this - please keep this in mind**

# Namerr

A Jellyfin-compatible media management system with automated renaming, Seerr API integration, and Docker support.

## Features

- **Multi-User Authentication**: Email/password login with role-based access (admin/user)
- **Library Management**: Add and manage local media directories with Docker volume mounts
- **Automated Renaming**: Background worker service runs every 4 hours to rename files
  - Movies: `"Title (Year).ext"`
  - TV Shows: `"Title S##E##.ext"`
- **Seerr Integration**: Fetch metadata from Overseerr/Jellyseerr for accurate renaming
- **Intelligent Parsing**: Removes quality tags, brackets, and other artifacts from filenames
- **Subtitle Support**: Automatically renames subtitle files alongside video files
- **Conflict Resolution**: Skip, increment, or overwrite on filename conflicts
- **Dry Run Mode**: Test renaming logic without actually modifying files
- **Job Tracking**: View history of all worker jobs with detailed logs
- **Docker Deployment**: Complete Docker Compose setup with PostgreSQL
- **🔥 Worker Management System**: Real-time monitoring and control
  - Live worker statistics (CPU, memory, files processed)
  - Real-time log streaming via Server-Sent Events
  - Worker heartbeat and health tracking
  - Foundation for distributed workers via SSH
  - Comprehensive dashboard at `/workers`

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better-auth
- **Styling**: Tailwind CSS v4
- **Worker Service**: Separate Node.js container with cron scheduler
- **File Scanning**: fast-glob
- **API Integration**: Seerr/Overseerr API client

## Quick Start

### One-Command Setup (Development)

```bash
git clone <your-repo-url>
cd namerr
bun run setup
```

This single command will:
- Install all dependencies (app + worker)
- Start PostgreSQL in Docker (if not already running)
- Wait for database to be ready
- Create database schema
- Seed with default admin user

Then:
```bash
# Terminal 1: Next.js app
bun run dev

# Terminal 2: Worker service
bun run worker:dev
```

**Login**: http://localhost:3000
- Email: `admin@namerr.app`
- Password: `admin123`

### Manual Setup (Development)

If you prefer manual setup:

```bash
# 1. Install dependencies
bun install
cd worker && bun install && cd ..

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local and set BETTER_AUTH_SECRET:
#   openssl rand -base64 32

# 3. Start PostgreSQL
bun run docker:dev

# 4. Initialize database
bun run db:push
bun run db:seed

# 5. Run dev servers
bun run dev              # Terminal 1
bun run worker:dev       # Terminal 2
```

### Production (Docker)

```bash
# 1. Clone repository
git clone <your-repo-url>
cd namerr

# 2. Set up environment
cp .env.example .env
# Edit .env and set:
#   - POSTGRES_PASSWORD (strong password)
#   - BETTER_AUTH_SECRET (openssl rand -base64 32)
#   - MEDIA_PATH=/path/to/your/media

# 3. Configure media volumes (edit docker-compose.yml)
# Change the volumes section to point to your media:
#   - /actual/path/to/movies:/media/movies:rw
#   - /actual/path/to/tv:/media/tv:rw

# 4. Deploy
bun run docker:prod

# 5. Initialize database (first time only)
bun run db:push
bun run db:seed
```

**Access**: http://localhost:3000
- Email: `admin@namerr.app`
- Password: `admin123`

**Useful commands**:
```bash
bun run docker:logs       # View logs
bun run docker:stop       # Stop all containers
bun run docker:clean      # Remove containers and volumes
```

## Usage Guide

### 1. Add a Library

1. Navigate to **Dashboard** → **Add Library**
2. Fill in the form:
   - **Name**: Friendly name (e.g., "Main Movies")
   - **Path**: Absolute path to media directory (e.g., `/media/movies`)
   - **Label**: Display label for tabs (e.g., "Movies")
   - **Type**: Movie or TV Show
3. Click **Create Library**

### 2. Scan Library

1. Go to your library detail page
2. Click **Scan Library** button
3. Wait for the scan to complete
4. Files will appear in the media grid

### 3. Configure Seerr (Optional)

1. Navigate to **Settings** → **Seerr**
2. Enter your Seerr/Overseerr details:
   - **API URL**: http://your-seerr-ip:5055
   - **API Key**: Found in Seerr → Settings → General → API Key
3. Click **Test Connection** to verify
4. Click **Save Settings**

### 4. Configure Worker

1. Navigate to **Settings** → **Worker**
2. Adjust settings:
   - **Dry Run Mode**: Enable for safe testing (no actual renaming)
   - **Parallel Workers**: 1-20 (higher = faster, more resource usage)
3. Click **Save Configuration**

### 5. Monitor Jobs

1. Navigate to **Jobs** to view worker job history
2. Click **View Logs** on any job to see detailed operation logs
3. Check for errors and verify renaming results

## Project Structure

```
namerr/
├── src/
│   ├── app/
│   │   ├── dashboard/           # Main dashboard
│   │   ├── libraries/           # Library management
│   │   ├── settings/            # Settings pages
│   │   │   ├── seerr/          # Seerr configuration
│   │   │   └── worker/         # Worker configuration
│   │   ├── jobs/               # Job history
│   │   ├── login/              # Authentication
│   │   └── api/                # API routes
│   ├── lib/
│   │   ├── db/                 # Database schema & connection
│   │   ├── auth.ts             # Better-auth config
│   │   ├── file-scanner.ts     # Media file scanner
│   │   ├── pattern-cleaner.ts  # Remove artifacts from filenames
│   │   ├── media-parser.ts     # Parse titles/years/episodes
│   │   ├── file-renamer.ts     # Rename files with conflict resolution
│   │   └── seerr-client.ts     # Seerr API integration
│   ├── types/
│   │   ├── media.ts            # Media-related types
│   │   └── seerr.ts            # Seerr API types
│   └── components/             # React components
├── worker/
│   ├── src/
│   │   ├── index.ts            # Worker entry point
│   │   ├── scheduler.ts        # Cron scheduler (every 4 hours)
│   │   ├── queue-processor.ts  # Job processor with parallel execution
│   │   └── lib/
│   │       ├── db.ts           # Shared database connection
│   │       └── logger.ts       # Structured logging
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml          # Docker orchestration
├── Dockerfile                  # Next.js app container
└── README.md
```

## Database Schema

- **users**: User accounts with roles
- **session/account/verification**: Better-auth tables
- **seerr_settings**: Seerr API configuration
- **media_libraries**: Library definitions
- **media_files**: Media files with parsed & Seerr metadata
- **subtitle_files**: Associated subtitle files
- **worker_jobs**: Background job tracking
- **worker_job_logs**: Per-file operation logs
- **system_config**: Worker configuration (parallelism, dry run mode)
- **cache_settings**: Redis configuration

## API Endpoints

### Libraries
- `GET /api/libraries` - List all libraries
- `POST /api/libraries` - Create library
- `GET /api/libraries/[id]` - Get library details
- `PATCH /api/libraries/[id]` - Update library
- `DELETE /api/libraries/[id]` - Delete library
- `POST /api/libraries/[id]/scan` - Trigger library scan
- `GET /api/libraries/[id]/media` - Get media files

### Seerr
- `GET /api/seerr/settings` - Get Seerr config (admin only)
- `PATCH /api/seerr/settings` - Update Seerr config (admin only)
- `POST /api/seerr/test` - Test Seerr connection (admin only)

### Worker
- `GET /api/worker/config` - Get worker config (admin only)
- `PATCH /api/worker/config` - Update worker config (admin only)
- `GET /api/worker/jobs` - List worker jobs
- `GET /api/worker/jobs/[id]` - Get job details
- `GET /api/worker/jobs/[id]/logs` - Get job logs

### Media
- `POST /api/media/[id]/metadata` - Fetch metadata from Seerr

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://mediamanager:password@postgres:5432/mediamanager
POSTGRES_PASSWORD=your-secure-password

# Auth
BETTER_AUTH_SECRET=random-32-byte-secret
BETTER_AUTH_URL=http://localhost:3000

# Docker (for docker-compose)
MEDIA_PATH=./media  # Path to your media directories
```

## Worker Service

The worker service is a separate Node.js process that:
- Runs on a cron schedule (every 4 hours)
- Processes pending rename jobs
- Supports parallel processing (configurable workers)
- Logs all operations to the database
- Respects dry run mode for safe testing

### Workflow

1. Scheduler creates rename jobs for enabled libraries
2. Queue processor fetches files with `renameStatus: 'ready'`
3. For each file:
   - Parse filename (title, year, season, episode)
   - Verify with Seerr (if configured)
   - Use metadata priority: manual > seerr > parsed
   - Generate new filename
   - Rename file (if not dry run)
   - Rename associated subtitles
   - Log operation results
4. Update job status and progress

## Renaming Logic

### Pattern Cleaning

Removes common torrent artifacts:
- Quality tags: `1080p`, `BluRay`, `WEB-DL`, `x264`, etc.
- Brackets: `[...]`, `(...)` (except years)
- Website prefixes: `www.site.com - `
- File extensions

### Media Parsing

**Movies**:
- Extracts title and year
- Handles malformed formats
- Validates year range (1900-2030)

**TV Shows**:
- Supports: `S01E01`, `1x01`, `Season 1 Episode 1`
- Extracts title, season, episode

### Conflict Resolution

- **Skip**: Don't rename if file exists
- **Increment**: Add "(1)", "(2)", etc.
- **Overwrite**: Replace existing file

## Troubleshooting

### Database connection failed
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Verify credentials and database exists

### Worker not processing jobs
- Check worker service logs: `docker compose logs worker`
- Verify cron schedule (every 4 hours)
- Ensure libraries are enabled
- Check system config for dry run mode

### Seerr connection failed
- Verify Seerr is accessible from the container
- Check API URL and key in settings
- Use IP address instead of hostname if DNS issues

### Files not found during scan
- Verify volume mounts in `docker-compose.yml`
- Check library path matches mounted volume
- Ensure read permissions on media directories

### Renamed files not showing in Jellyfin
- Run Jellyfin library scan
- Check that naming follows Jellyfin conventions

## Development

### Database Migrations

```bash
# Generate migration from schema changes
bun run db:generate

# Apply migrations
bun run db:migrate

# Push schema directly (dev only)
bun run db:push

# Open Drizzle Studio
bun run db:studio
```

### Worker Development

```bash
cd worker
bun run dev  # Uses bun --watch for hot reload
```

## License

MIT

## Credits

Ported from Python jellyfin_renamer.py with improvements and web UI.
