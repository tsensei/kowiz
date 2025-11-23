# KOWiz Deployment Guide

Complete guide for deploying KOWiz to production using Docker and Coolify.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [GitHub Actions Setup](#github-actions-setup)
3. [Local Testing](#local-testing)
4. [Coolify Deployment](#coolify-deployment)
5. [Manual Docker Deployment](#manual-docker-deployment)
6. [Database Migrations](#database-migrations)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Services

- **PostgreSQL 16+** - Database for file metadata and job queue
- **MinIO** (or S3-compatible storage) - Object storage for files
- **Docker** - Container runtime
- **Self-hosted Registry** - For Docker images

### Required Tools (Development)

```bash
# macOS
brew install ffmpeg imagemagick yt-dlp

# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg imagemagick
pip install yt-dlp
```

---

## 🚀 GitHub Actions Setup

### Step 1: Add GitHub Secrets

Go to your GitHub repository: **Settings → Secrets and variables → Actions**

Add these secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `REGISTRY_URL` | Your registry URL (without https://) | `registry.yourdomain.com` |
| `REGISTRY_USERNAME` | Registry username | `your-username` |
| `REGISTRY_PASSWORD` | Registry password/token | `your-password` |

### Step 2: Verify Workflow

The workflow file is located at `.github/workflows/build-and-push.yml`

**What it does:**
1. Triggers on push to `main` branch
2. Builds two Docker images:
   - `kowiz-web` (Next.js application)
   - `kowiz-worker` (Background processor)
3. Pushes to your self-hosted registry
4. Tags with:
   - `latest` (main branch)
   - `main-<sha>` (commit hash)
   - `<branch>` (branch name)

### Step 3: Test the Workflow

```bash
# Make a small change and push
git commit --allow-empty -m "test: trigger deployment"
git push
```

Watch the build at: **Actions tab in GitHub**

**Expected result:**
- ✅ Two images pushed to your registry
- ✅ Tagged as `latest` and `main-<sha>`

---

## 🧪 Local Testing (End-to-End)

### Quick Test with Docker Compose

```bash
# Build and start all services locally
docker-compose -f docker-compose.local.yml up --build

# This will start:
# - PostgreSQL (localhost:5432)
# - MinIO (localhost:9000, 9001)
# - Next.js Web (localhost:3000)
# - Worker (background)
# - Migration (runs once)
```

**Access the application:**
- Web: http://localhost:3000
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

**Stop everything:**
```bash
docker-compose -f docker-compose.local.yml down
```

**Clean reset (remove all data):**
```bash
docker-compose -f docker-compose.local.yml down -v
```

---

## ☁️ Coolify Deployment

### Prerequisites in Coolify

1. **PostgreSQL Database** - Create a PostgreSQL service
2. **MinIO Service** - Create a MinIO service (or use external S3)
3. **Docker Registry** - Your self-hosted registry accessible

### Step 1: Prepare Environment Variables

Create a `.env` file for Coolify with:

```bash
# Database (from Coolify PostgreSQL service)
DATABASE_HOST=postgres-kowiz.internal
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your-db-password
DATABASE_NAME=kowiz

# MinIO (from Coolify MinIO service or external)
MINIO_ENDPOINT=minio-kowiz.internal
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-minio-key
MINIO_SECRET_KEY=your-minio-secret
MINIO_USE_SSL=false

# Registry (for pulling images)
REGISTRY_URL=registry.yourdomain.com

# Application
PORT=3000
NODE_ENV=production
```

### Step 2: Create Coolify Project

1. **New Project** in Coolify
2. **Add Resource → Docker Compose**
3. **Upload** `docker-compose.prod.yml`
4. **Set Environment Variables** from above
5. **Deploy**

### Step 3: Run Database Migration

**Option A: Using Coolify Console**

```bash
# Connect to web container
docker exec -it kowiz-web sh

# Run migration
pnpm drizzle-kit push
```

**Option B: Using Migration Script**

```bash
# On your server
cd /path/to/kowiz
export DATABASE_HOST=...
export DATABASE_PORT=5432
export DATABASE_USER=postgres
export DATABASE_PASSWORD=...
export DATABASE_NAME=kowiz

chmod +x scripts/migrate.sh
./scripts/migrate.sh
```

### Step 4: Setup MinIO Buckets

```bash
# On your server
export MINIO_ENDPOINT=...
export MINIO_PORT=9000
export MINIO_ACCESS_KEY=...
export MINIO_SECRET_KEY=...

chmod +x scripts/setup-minio.sh
./scripts/setup-minio.sh
```

### Step 5: Verify Deployment

1. **Check Web App**: https://your-domain.com
2. **Upload Test File**: Upload a small image
3. **Check Worker Logs**: `docker logs kowiz-worker`
4. **Verify Database**: Check file records
5. **Check MinIO**: Verify files in buckets

---

## 🐳 Manual Docker Deployment

If not using Coolify, deploy manually:

### Step 1: Pull Images

```bash
# Login to your registry
docker login registry.yourdomain.com

# Pull images
docker pull registry.yourdomain.com/kowiz-web:latest
docker pull registry.yourdomain.com/kowiz-worker:latest
```

### Step 2: Create Environment File

```bash
# Create .env.production
cat > .env.production << 'EOF'
DATABASE_HOST=your-postgres-host
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your-password
DATABASE_NAME=kowiz

MINIO_ENDPOINT=your-minio-host
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-key
MINIO_SECRET_KEY=your-secret
MINIO_USE_SSL=true

REGISTRY_URL=registry.yourdomain.com
EOF
```

### Step 3: Deploy with Docker Compose

```bash
# Using production compose file
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### Step 4: Run Migrations

```bash
# Wait for database to be ready
docker-compose -f docker-compose.prod.yml exec web pnpm drizzle-kit push
```

### Step 5: Check Status

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f web
docker-compose -f docker-compose.prod.yml logs -f worker

# Check containers
docker-compose -f docker-compose.prod.yml ps
```

---

## 💾 Database Migrations

### Automated Migration (Recommended)

The migration script handles everything:

```bash
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export DATABASE_USER=postgres
export DATABASE_PASSWORD=your-password
export DATABASE_NAME=kowiz

chmod +x scripts/migrate.sh
./scripts/migrate.sh
```

### Manual Migration

```bash
# Generate migration (development)
pnpm drizzle-kit generate

# Apply migration
pnpm drizzle-kit push

# Verify
PGPASSWORD=$DATABASE_PASSWORD psql \
  -h $DATABASE_HOST \
  -U $DATABASE_USER \
  -d $DATABASE_NAME \
  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
```

### Migration in Docker

```bash
# Run migration in container
docker exec kowiz-web pnpm drizzle-kit push

# Or use the migrate service (docker-compose.local.yml)
docker-compose -f docker-compose.local.yml up migrate
```

---

## 📊 Monitoring

### Health Checks

**Web Application:**
```bash
curl http://localhost:3000/api/files
# Should return: {"files": [...]}
```

**Worker:**
```bash
# Check logs for heartbeat
docker logs kowiz-worker --tail 50

# Should see periodic job processing
```

**Database:**
```bash
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "
SELECT 
  status, 
  COUNT(*) 
FROM files 
GROUP BY status;
"
```

**Queue Status:**
```bash
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "
SELECT 
  state, 
  COUNT(*) 
FROM pgboss.job 
WHERE name = 'file-conversion' 
GROUP BY state;
"
```

### Metrics to Monitor

- **File processing rate** - Files completed per hour
- **Queue depth** - Jobs waiting to be processed
- **Worker CPU/Memory** - Resource usage during conversion
- **Failed job rate** - Percentage of failed conversions
- **Storage usage** - MinIO bucket sizes

---

## 🔍 Troubleshooting

### Web Container Won't Start

```bash
# Check logs
docker logs kowiz-web

# Common issues:
# 1. Database not reachable
#    → Check DATABASE_HOST and network
# 2. Port already in use
#    → Change PORT environment variable
# 3. Missing environment variables
#    → Verify all required vars are set
```

### Worker Not Processing Jobs

```bash
# Check worker logs
docker logs kowiz-worker -f

# Common issues:
# 1. pg-boss connection failed
#    → Check DATABASE_HOST
# 2. MinIO connection failed
#    → Check MINIO_ENDPOINT
# 3. FFmpeg/yt-dlp not found
#    → Rebuild worker image
```

### Database Connection Failed

```bash
# Test connection from web container
docker exec kowiz-web sh -c "
  apk add --no-cache postgresql-client &&
  psql -h \$DATABASE_HOST -U \$DATABASE_USER -d \$DATABASE_NAME -c 'SELECT 1'
"
```

### MinIO Upload Failed

```bash
# Test MinIO connection
docker exec kowiz-web sh -c "
  wget -O- http://\$MINIO_ENDPOINT:\$MINIO_PORT/minio/health/live
"

# Check buckets exist
docker exec kowiz-web sh -c "mc ls kowiz/"
```

### Queue Jobs Stuck

```bash
# Check pg-boss state
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "
SELECT id, state, created_on, started_on 
FROM pgboss.job 
WHERE name = 'file-conversion' 
AND state IN ('created', 'active')
ORDER BY created_on DESC 
LIMIT 10;
"

# Restart worker to pick up stuck jobs
docker restart kowiz-worker
```

---

## 🔄 Updates and Rollbacks

### Deploy New Version

```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Restart services
docker-compose -f docker-compose.prod.yml up -d

# Run any new migrations
docker exec kowiz-web pnpm drizzle-kit push
```

### Rollback to Previous Version

```bash
# Stop current version
docker-compose -f docker-compose.prod.yml down

# Update docker-compose.prod.yml to use previous tag
# Change: kowiz-web:latest → kowiz-web:main-abc123

# Start previous version
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔐 Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Change default MinIO credentials
- [ ] Enable SSL for MinIO (set MINIO_USE_SSL=true)
- [ ] Use strong registry password
- [ ] Restrict database access to internal network
- [ ] Restrict MinIO access to internal network
- [ ] Enable HTTPS for web application
- [ ] Set up firewall rules
- [ ] Regular security updates for base images
- [ ] Rotate credentials regularly

---

## 📈 Performance Tuning

### Worker Scaling

**Vertical Scaling (More Resources):**
```yaml
# docker-compose.prod.yml
worker:
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 8G
```

**Horizontal Scaling (More Workers):**
```yaml
# docker-compose.prod.yml
worker:
  deploy:
    replicas: 4  # Run 4 worker containers
```

### Database Optimization

```sql
-- Increase PostgreSQL performance
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
```

### MinIO Performance

```yaml
# Use more drives for better I/O
minio:
  command: server /data{1...4} --console-address ":9001"
  volumes:
    - /mnt/disk1:/data1
    - /mnt/disk2:/data2
    - /mnt/disk3:/data3
    - /mnt/disk4:/data4
```

---

## 🗂️ Backup Strategy

### PostgreSQL Backup

```bash
# Automated daily backup
0 2 * * * docker exec kowiz-postgres pg_dump -U postgres kowiz | gzip > /backups/kowiz-$(date +\%Y\%m\%d).sql.gz

# Restore from backup
gunzip < /backups/kowiz-20231123.sql.gz | docker exec -i kowiz-postgres psql -U postgres -d kowiz
```

### MinIO Backup

```bash
# Mirror buckets to backup location
mc mirror kowiz/raw-files /backup/raw-files
mc mirror kowiz/processed-files /backup/processed-files

# Or use MinIO's built-in replication
mc replicate add kowiz/raw-files --remote-bucket backup/raw-files
```

---

## 🚦 Deployment Workflow

### Complete Deployment Process

```bash
# 1. Push code to GitHub
git push origin main

# 2. GitHub Actions builds and pushes images
#    (automatic, takes ~5-10 minutes)

# 3. Pull images on server
docker-compose -f docker-compose.prod.yml pull

# 4. Run migrations
./scripts/migrate.sh

# 5. Deploy
docker-compose -f docker-compose.prod.yml up -d

# 6. Verify
curl https://your-domain.com/api/files
docker logs kowiz-worker --tail 20

# 7. Monitor
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 📦 File Structure for Deployment

```
kowiz/
├── .github/
│   └── workflows/
│       └── build-and-push.yml     # CI/CD workflow
├── scripts/
│   ├── migrate.sh                  # Database migration
│   └── setup-minio.sh              # MinIO bucket setup
├── Dockerfile                      # Web app image
├── Dockerfile.worker               # Worker image
├── docker-compose.local.yml        # Local testing
├── docker-compose.prod.yml         # Production (Coolify)
├── .dockerignore                   # Exclude from build
└── .env.production.example         # Environment template
```

---

## 🎯 Quick Start Checklist

### For GitHub Actions:
- [ ] Add GitHub Secrets (REGISTRY_URL, USERNAME, PASSWORD)
- [ ] Push to main branch
- [ ] Verify images in registry
- [ ] Note image tags for deployment

### For Coolify:
- [ ] Create PostgreSQL service
- [ ] Create MinIO service (or configure external S3)
- [ ] Create new Docker Compose project
- [ ] Upload docker-compose.prod.yml
- [ ] Set environment variables
- [ ] Deploy
- [ ] Run migrations
- [ ] Setup MinIO buckets
- [ ] Verify deployment

### For Manual Deployment:
- [ ] Setup PostgreSQL
- [ ] Setup MinIO
- [ ] Pull Docker images
- [ ] Create .env.production
- [ ] Run migrations
- [ ] Setup MinIO buckets
- [ ] Start services
- [ ] Configure reverse proxy (nginx/caddy)
- [ ] Setup SSL certificates
- [ ] Configure firewall

---

## 🌐 Reverse Proxy Setup (nginx)

```nginx
# /etc/nginx/sites-available/kowiz
server {
    listen 80;
    server_name kowiz.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kowiz.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/kowiz.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kowiz.yourdomain.com/privkey.pem;
    
    client_max_body_size 500M;  # Allow large file uploads
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long conversions
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

# MinIO Console (optional)
server {
    listen 443 ssl http2;
    server_name minio.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/minio.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/minio.yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:9001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔧 Environment-Specific Configurations

### Development
```bash
NODE_ENV=development
DATABASE_HOST=localhost
MINIO_USE_SSL=false
```

### Staging
```bash
NODE_ENV=production
DATABASE_HOST=staging-db.internal
MINIO_USE_SSL=true
```

### Production
```bash
NODE_ENV=production
DATABASE_HOST=prod-db.internal
MINIO_USE_SSL=true
# + All other production configs
```

---

## 📞 Support Checklist

Before reaching out for help:

1. **Check logs:**
   ```bash
   docker logs kowiz-web
   docker logs kowiz-worker
   ```

2. **Verify services:**
   ```bash
   docker ps
   docker-compose ps
   ```

3. **Test database:**
   ```bash
   PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT 1"
   ```

4. **Test MinIO:**
   ```bash
   curl http://$MINIO_ENDPOINT:$MINIO_PORT/minio/health/live
   ```

5. **Check environment variables:**
   ```bash
   docker exec kowiz-web env | grep DATABASE
   ```

---

## 🎉 Success Criteria

Your deployment is successful when:

- ✅ Web application accessible at your domain
- ✅ Upload test file completes successfully
- ✅ Worker processes files (check logs)
- ✅ Files appear in MinIO buckets
- ✅ Database records created
- ✅ Conversions complete successfully
- ✅ Download buttons work
- ✅ URL import works (YouTube test)
- ✅ No errors in logs
- ✅ System survives restart

---

## 🚀 Ready to Deploy!

Follow the steps for your deployment method:
- **Coolify**: See [Coolify Deployment](#coolify-deployment)
- **Manual**: See [Manual Docker Deployment](#manual-docker-deployment)
- **Local Test**: See [Local Testing](#local-testing)

Good luck! 🎊

