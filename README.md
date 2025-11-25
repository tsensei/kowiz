# KOWiz - Wikimedia Commons Media Converter

Automatic media conversion system for Wikimedia Commons. Upload any media file and KOWiz converts it to Commons-compatible formats with a clean, modern interface.

## ✨ Features

- **🔐 Wikimedia OAuth2** - Secure authentication with Wikimedia accounts
- **👤 User Isolation** - Each user sees only their own files and conversions
- **🎯 Smart Format Detection** - Automatically detects and categorizes media files (image/video/audio/RAW)
- **🔄 Auto Conversion** - Converts unsupported formats to Commons-compatible formats using FFmpeg and ImageMagick
- **📤 Drag & Drop Upload** - Modern upload interface with multi-file and folder support
- **🔗 URL Import** - Import videos from YouTube, Vimeo, or direct links using yt-dlp
- **⚡ Background Processing** - pg-boss queue system with PostgreSQL backend
- **📊 Real-time Monitoring** - Live progress tracking with auto-refresh
- **💾 Dual Storage** - Preserves original files and stores converted versions in MinIO
- **🔁 Automatic Retry** - Failed conversions retry up to 3 times automatically
- **📱 Responsive Design** - Clean, spacious UI with tab-based navigation
- **🛡️ Atomic Operations** - Automatic rollback on failures, no orphaned records

## 🎯 Supported Conversions

### Images
- **HEIC/HEIF → JPEG** (Apple Photos format)
- **WebP → JPEG** (Modern web format)
- **BMP → JPEG** (Legacy bitmap)

### RAW Formats
- **CR2/NEF/ARW/DNG/RW2 → TIFF** (Preserves quality)
- Supports: Canon, Nikon, Sony, Adobe, Panasonic, Olympus, Fujifilm

### Videos
- **MP4/MOV/AVI/MKV → WebM** (VP9 + Opus codec)
- Optimized for Wikimedia Commons requirements
- Max resolution: 1920x1080, preserves aspect ratio

### Audio
- **MP3/AAC/M4A → Ogg Vorbis** (Commons standard)
- Quality level 6 (balanced quality/size)

### Already Supported (No Conversion)
- **Images:** JPEG, PNG, GIF, SVG, TIFF
- **Videos:** WebM, OGV
- **Audio:** OGG, OPUS, WAV, FLAC

## 🏗️ Architecture

```
Frontend (Next.js 16)
    ↓
API Routes (Upload, Files, Download, Retry)
    ↓
Services Layer
    ├── FormatDetectionService (Smart categorization)
    ├── ConversionService (FFmpeg/ImageMagick)
    ├── DatabaseService (PostgreSQL operations)
    ├── MinioService (Object storage)
    └── QueueService (pg-boss jobs)
    ↓
Infrastructure
    ├── PostgreSQL (File metadata + Job queue)
    ├── MinIO (Raw & processed files)
    └── FFmpeg/ImageMagick (Conversion engines)
    ↓
Worker (Background processing)
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** package manager
- **Docker** & Docker Compose
- **FFmpeg** (for media conversion)
- **yt-dlp** (for URL imports from YouTube, Vimeo, etc.)

### Installation

1. **Install FFmpeg, ImageMagick, and yt-dlp:**

```bash
# macOS
brew install ffmpeg imagemagick yt-dlp

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg imagemagick
pip install yt-dlp

# Verify installation
ffmpeg -version
yt-dlp --version
```

2. **Clone and install dependencies:**

```bash
cd kowiz
pnpm install
```

3. **Configure environment variables:**

Create `.env.local`:

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=kowiz

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# NextAuth
AUTH_SECRET=your-secret-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Wikimedia OAuth2
AUTH_WIKIMEDIA_ID=your-wikimedia-client-id
AUTH_WIKIMEDIA_SECRET=your-wikimedia-client-secret
```

4. **Set up Wikimedia OAuth2:**

   a. Visit https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2

   b. Fill in the form:
      - **Application name**: KOWiz (or your preferred name)
      - **OAuth callback URL**: `http://localhost:3000/api/auth/callback/wikimedia`
      - **Grants**: Select "User identity verification only"

   c. Copy the Client ID and Client Secret to your `.env.local`

5. **Start Docker services:**

```bash
docker-compose up -d
```

This starts PostgreSQL, MinIO, and the converter container.

6. **Run database migration:**

```bash
pnpm drizzle-kit push
```

7. **Start the development server:**

```bash
pnpm dev
```

8. **Start the worker (in a new terminal):**

```bash
pnpm worker
```

9. **Open the application:**

```
http://localhost:3000
```

10. **Sign in with Wikimedia:**

Click the "Sign in with Wikimedia" button and authorize the application.

## 🎬 Usage

### Upload Tab
1. **File Upload:** Drag and drop files or click to browse
2. **Folder Upload:** Click "Upload Folder" for bulk uploads
3. **URL Import:** Paste YouTube or direct media URLs to import
4. View quick stats and recently uploaded files

### Queue Tab
4. Monitor active conversions with real-time progress
5. See queued files waiting for processing
6. View and retry any failed conversions

### Completed Tab
7. Browse all successfully converted files
8. Search and filter your files
9. Download both original and converted versions

## 📊 Database Schema

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  wikimedia_id    VARCHAR(255) UNIQUE NOT NULL,
  username        VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  name            VARCHAR(255),
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  last_login_at   TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE files (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  size                BIGINT NOT NULL,
  mime_type           VARCHAR(100) NOT NULL,
  category            VARCHAR(50) NOT NULL,        -- image/video/audio/raw
  original_format     VARCHAR(50) NOT NULL,        -- heic, mp4, mp3
  target_format       VARCHAR(50),                 -- jpeg, webm, ogg
  needs_conversion    VARCHAR(10) DEFAULT 'true',
  converted_size      BIGINT,
  import_source       VARCHAR(50) DEFAULT 'upload', -- upload/youtube/direct_url
  source_url          TEXT,
  raw_file_path       VARCHAR(500) NOT NULL,
  processed_file_path VARCHAR(500),
  status              VARCHAR(50) DEFAULT 'pending',
  error_message       TEXT,
  retry_count         BIGINT DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  converted_at        TIMESTAMP,
  uploaded_at         TIMESTAMP
);
```

## 🔧 Configuration

### Environment Variables

Create `.env.local`:

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=kowiz

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# NextAuth
AUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# Wikimedia OAuth2
AUTH_WIKIMEDIA_ID=your-wikimedia-client-id
AUTH_WIKIMEDIA_SECRET=your-wikimedia-client-secret
```

### Worker Concurrency

Adjust in `worker.ts`:

```typescript
{ connection, concurrency: 2 } // 2-4 recommended based on CPU cores
```

### Conversion Quality

Adjust in `lib/services/conversion.service.ts`:

```typescript
// Images
-quality 95  // 85-95 recommended

// Videos
-crf 30      // 25-35 (lower = better quality, slower)
-b:v 2M      // 1M-4M bitrate
```

## 🛠️ Scripts

```bash
pnpm dev          # Start Next.js dev server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm worker       # Start background worker
pnpm lint         # Run ESLint

# Drizzle ORM
pnpm drizzle-kit generate  # Generate migration
pnpm drizzle-kit push      # Apply migration
```

## 🐳 Docker Services

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker logs kowiz-postgres
docker logs kowiz-minio
docker logs kowiz-redis

# Reset all data
docker-compose down -v
```

### Service URLs

- **Application:** http://localhost:3000
- **MinIO Console:** http://localhost:9001 (minioadmin/minioadmin)
- **PostgreSQL:** localhost:5432

## 🔍 Monitoring

### Check Queue Status

```bash
# Connect to PostgreSQL
PGPASSWORD=postgres psql -h localhost -U postgres -d kowiz

# Check waiting jobs
SELECT COUNT(*) FROM pgboss.job WHERE name = 'file-conversion' AND state = 'created';

# Check active jobs
SELECT COUNT(*) FROM pgboss.job WHERE name = 'file-conversion' AND state = 'active';

# Check completed
SELECT COUNT(*) FROM pgboss.job WHERE name = 'file-conversion' AND state = 'completed';

# Check failed
SELECT COUNT(*) FROM pgboss.job WHERE name = 'file-conversion' AND state = 'failed';

# View all job states
SELECT state, COUNT(*) FROM pgboss.job WHERE name = 'file-conversion' GROUP BY state;
```

### Check Database

```bash
# Connect to PostgreSQL
PGPASSWORD=postgres psql -h localhost -U postgres -d kowiz

# View all files
SELECT name, category, status FROM files;

# Count by status
SELECT status, COUNT(*) FROM files GROUP BY status;

# View failed files
SELECT name, error_message FROM files WHERE status = 'failed';
```

### Check Storage

Open MinIO Console at http://localhost:9001 and check:
- **raw-files** bucket - Original uploaded files
- **processed-files** bucket - Converted files

## 🛡️ Error Handling & Resilience

### Automatic Rollback

The upload process implements atomic-like behavior:

1. **Database record created** → If MinIO fails: DB record deleted
2. **File uploaded to MinIO** → If queue fails: MinIO file + DB record deleted
3. **Job added to queue** → If status update fails: Continue (worker processes anyway)

**Result:** No orphaned records or files

### Retry Mechanism

- **Automatic:** Up to 3 retry attempts with exponential backoff
- **Manual:** Retry button in UI after automatic attempts exhausted
- **Tracking:** Retry count stored in database

### Recovery Utilities

**Clean up orphaned records:**
```bash
curl -X POST http://localhost:3000/api/files/cleanup-orphaned
```

**Requeue pending files:**
```bash
curl -X POST http://localhost:3000/api/files/requeue-pending
```

## 📁 Project Structure

```
kowiz/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/route.ts      # NextAuth handler
│   │   ├── files/
│   │   │   ├── route.ts                    # GET user's files
│   │   │   ├── [id]/download/route.ts      # Download files
│   │   │   ├── [id]/stream/route.ts        # Stream files
│   │   │   ├── [id]/retry/route.ts         # Retry conversion
│   │   │   ├── cleanup-orphaned/route.ts   # Cleanup utility
│   │   │   └── requeue-pending/route.ts    # Requeue utility
│   │   ├── upload/route.ts                 # Upload endpoint
│   │   └── import-url/route.ts             # URL import endpoint
│   ├── auth/
│   │   ├── signin/page.tsx                 # Sign in page
│   │   └── error/page.tsx                  # Auth error page
│   ├── layout.tsx                          # Root layout with SessionProvider
│   └── page.tsx                            # Main UI with tabs
├── components/
│   ├── auth/
│   │   └── auth-button.tsx                 # Sign in/out button
│   ├── providers/
│   │   └── session-provider.tsx            # NextAuth session provider
│   ├── ui/                                 # shadcn/ui components
│   ├── upload-tab.tsx                      # Upload interface
│   ├── queue-tab.tsx                       # Active monitoring
│   ├── completed-tab.tsx                   # Download interface
│   ├── file-dropzone.tsx                   # Drag-drop upload
│   └── file-card.tsx                       # File status card
├── lib/
│   ├── auth.ts                             # NextAuth config
│   ├── auth-utils.ts                       # Auth helper functions
│   ├── db/
│   │   ├── index.ts                        # Database connection
│   │   ├── schema.ts                       # Drizzle schema (users + files)
│   │   └── migrations/                     # Migration files
│   └── services/
│       ├── database.service.ts             # DB operations
│       ├── minio.service.ts                # Object storage
│       ├── queue.service.ts                # Job queue
│       ├── format-detection.service.ts     # Format detection
│       └── conversion.service.ts           # Media conversion
├── types/
│   └── next-auth.d.ts                      # NextAuth type definitions
├── worker.ts                               # Background worker
├── docker-compose.yml                      # Infrastructure
├── drizzle.config.ts                       # ORM config
└── package.json                            # Dependencies
```

## 🧪 Testing

### Test Format Detection

Upload files with different formats:
- ✅ HEIC → Should convert to JPEG
- ✅ MP4 → Should convert to WebM  
- ✅ MP3 → Should convert to OGG
- ✅ JPEG → Should skip conversion

### Test Bulk Upload

1. Click "Upload Folder"
2. Select folder with 10+ mixed media files
3. Watch concurrent processing (2 at a time)
4. Verify all complete successfully

### Test Error Recovery

1. Stop worker
2. Upload files (they'll queue)
3. Restart worker
4. Files should process automatically

### Test Retry

1. Upload a corrupt/invalid file
2. Check Failed tab
3. Click "Retry Conversion"
4. Verify retry count increments

## 🎯 Key Benefits of pg-boss

- ✅ **Simpler Infrastructure** - One less Docker container (no Redis needed)
- ✅ **Built-in Persistence** - Jobs survive crashes automatically
- ✅ **Transactional Safety** - Queue operations can use PostgreSQL transactions
- ✅ **Unified Backup** - One database backup includes everything
- ✅ **SQL Monitoring** - Query jobs using standard SQL
- ✅ **Lower Cost** - Fewer services to run and manage

## 🚨 Troubleshooting

### "No conversion needed" but file not supported

The file is already in a Commons-supported format (JPEG, PNG, etc.). No conversion required.

### Worker not processing files

```bash
# Check worker is running
ps aux | grep tsx

# Check Redis connection
docker exec kowiz-redis redis-cli PING

# Restart worker
pnpm worker
```

### Files stuck in "pending" status

```bash
# Requeue pending files
curl -X POST http://localhost:3000/api/files/requeue-pending
```

### "The specified key does not exist" error

This means the database has records but files are missing from MinIO (orphaned records).

```bash
# Clean up orphaned records
curl -X POST http://localhost:3000/api/files/cleanup-orphaned
```

### Jobs stuck in queue

```bash
# Check pg-boss jobs
PGPASSWORD=postgres psql -h localhost -U postgres -d kowiz -c "SELECT * FROM pgboss.job WHERE state = 'failed' LIMIT 5;"

# Retry failed jobs (will be picked up on next worker start)
# Or use the UI retry button
```

### Docker network issues

```bash
docker network prune -f
docker-compose down
docker-compose up -d
```

### Reset everything

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Restart
docker-compose up -d
pnpm drizzle-kit push
```

## 📈 Performance

### Typical Conversion Times

| Type | Size | Time |
|------|------|------|
| HEIC → JPEG | 5 MB | 2-5s |
| RAW → TIFF | 25 MB | 5-10s |
| MP4 → WebM | 100 MB | 30-60s |
| MP3 → OGG | 5 MB | 3-5s |

### Optimization

**Increase concurrency:**
```typescript
// worker.ts
{ connection, concurrency: 4 }  // Based on CPU cores
```

**Reduce quality for faster processing:**
```typescript
// conversion.service.ts
-quality 85    // Instead of 95 for images
-crf 35        // Instead of 30 for videos
```

## 🔐 Security & Authentication

### Wikimedia OAuth2

KOWiz uses Wikimedia OAuth2 for secure user authentication:

- **User Accounts**: Users must sign in with their Wikimedia account
- **User Isolation**: Each user can only see and access their own files
- **Automatic User Management**: User records are created/updated automatically on sign-in
- **Session Security**: JWT tokens with NextAuth.js for secure session management

### File Security

- MinIO buckets are private by default
- Download URLs expire after 1 hour
- Files accessible only via presigned URLs
- No direct MinIO access from frontend
- All API routes verify user authentication and file ownership

## 🛠️ Tech Stack

**Frontend:**
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui components
- react-dropzone
- @tanstack/react-table

**Backend:**
- Next.js API Routes
- NextAuth.js (Wikimedia OAuth2)
- Drizzle ORM
- PostgreSQL 16
- MinIO (S3-compatible storage)
- pg-boss (PostgreSQL-based queue)

**Conversion:**
- FFmpeg 8.0
- ImageMagick (optional)

**Infrastructure:**
- Docker Compose
- Node.js 20+

## 📝 API Endpoints

All endpoints require authentication via NextAuth.js session.

### Authentication
```typescript
GET  /api/auth/signin              # Sign in page
POST /api/auth/signout             # Sign out
GET  /api/auth/session             # Get current session
GET  /api/auth/callback/wikimedia  # OAuth callback
```

### Upload Files
```typescript
POST /api/upload
Headers: Cookie with session
Body: FormData with 'files' field (multiple files)
Response: { success, results, totalFiles, successfulUploads, failedUploads }
```

### Import from URL
```typescript
POST /api/import-url
Headers: Cookie with session
Body: { url: string }
Response: { success, file: { id, name, importSource, sourceUrl, status, type, platform } }
```

### Get User's Files
```typescript
GET /api/files
Headers: Cookie with session
Response: { files: File[] }  # Only returns current user's files
```

### Download File
```typescript
GET /api/files/[id]/download?type=raw|converted
Headers: Cookie with session
Response: File stream (verifies user ownership)
```

### Stream File
```typescript
GET /api/files/[id]/stream?type=raw|converted
Headers: Cookie with session
Response: File stream for inline viewing (verifies user ownership)
```

### Retry Conversion
```typescript
POST /api/files/[id]/retry
Headers: Cookie with session
Response: { success, message }
```

### Utilities
```typescript
POST /api/files/cleanup-orphaned    # Clean orphaned records
POST /api/files/requeue-pending     # Requeue pending files
```

## 🎨 UI Components

### Three Main Tabs

1. **Upload** - Focused upload experience with stats
2. **Queue** - Active monitoring of processing files
3. **Completed** - Browse and download converted files

### Key Features
- Drag & drop zone
- Folder upload support
- Real-time progress bars
- Status filtering
- Search functionality
- Download buttons

## 🚀 Production Deployment

### Docker Deployment (Recommended)

**Complete deployment guide:** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

**Quick Start:**

1. **Setup GitHub Secrets** - See [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md)
   ```
   REGISTRY_URL, REGISTRY_USERNAME, REGISTRY_PASSWORD
   ```

2. **Push to GitHub** - Triggers automatic build
   ```bash
   git push origin main
   ```

3. **Deploy with Coolify**
   - Use `docker-compose.prod.yml`
   - Configure environment variables
   - Deploy and run migrations

4. **Or Deploy Manually**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ./scripts/migrate.sh
   ```

### Local Testing with Docker

```bash
# Full end-to-end test
docker-compose -f docker-compose.local.yml up --build

# Access at http://localhost:3000
```

### Using PM2 (Alternative)

```bash
# Install PM2
pnpm add -g pm2

# Start Next.js
pm2 start "pnpm start" --name kowiz-web

# Start Worker
pm2 start tsx --name kowiz-worker -- worker.ts

# Save configuration
pm2 save
pm2 startup

# Monitor
pm2 monit
```

### Environment Variables

Ensure all required environment variables are set in production. Never commit `.env.local` to git.

### Resource Requirements

**Minimum:**
- 2 CPU cores
- 4 GB RAM
- 20 GB storage

**Recommended:**
- 4 CPU cores
- 8 GB RAM
- 100+ GB storage

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please ensure:
- Code passes `pnpm build`
- Follow existing code style
- Add tests for new features
- Update documentation

## 📚 Documentation

- **[README.md](./README.md)** - This file (quick start and overview)
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
- **[GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md)** - GitHub Actions configuration

## 🏗️ Deployment Files

```
├── Dockerfile                    # Next.js web app
├── Dockerfile.worker             # Background worker with FFmpeg
├── docker-compose.yml            # Development setup
├── docker-compose.local.yml      # Local end-to-end testing
├── docker-compose.prod.yml       # Production (Coolify)
├── .github/workflows/
│   └── build-and-push.yml        # CI/CD pipeline
└── scripts/
    ├── migrate.sh                # Database migration
    └── setup-minio.sh            # MinIO bucket setup
```

## 🆘 Support

For issues or questions:
1. Check this README
2. Review [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
3. Check logs: `docker logs kowiz-web` or `docker logs kowiz-worker`
4. Verify services: `docker ps`

---

**Built with ❤️ for Wikimedia Commons contributors**
