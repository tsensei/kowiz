# KOWiz - Wikimedia Commons Media Converter

Automatic media conversion system for Wikimedia Commons. Upload any media file and KOWiz converts it to Commons-compatible formats with a clean, modern interface.

## ✨ Features

### Core Functionality
- **🔐 Wikimedia OAuth2** - Secure authentication with Wikimedia accounts
- **👤 User Isolation** - Each user sees only their own files and conversions
- **🎯 Smart Format Detection** - Automatically detects and categorizes media files (image/video/audio/RAW)
- **🔄 Auto Conversion** - Converts unsupported formats to Commons-compatible formats using FFmpeg and ImageMagick
- **⚡ Background Processing** - pg-boss queue system with PostgreSQL backend
- **📊 Real-time Monitoring** - Live progress tracking with auto-refresh
- **💾 Dual Storage** - Preserves original files and stores converted versions in MinIO
- **🔁 Automatic Retry** - Failed conversions retry up to 3 times automatically
- **🛡️ Atomic Operations** - Automatic rollback on failures, no orphaned records

### Upload & Import
- **📤 Drag & Drop Upload** - Modern upload interface with multi-file and folder support
- **🔄 Resumable Uploads** - TUS protocol support for large file uploads with pause/resume capability
- **🔗 URL Import** - Import videos from YouTube, Vimeo, or direct links using yt-dlp
- **📁 Bulk Upload** - Upload entire folders with automatic recursive file discovery
- **📈 Real-time Progress** - FFmpeg integration shows actual conversion progress during processing

### Media Editing & Enhancement
- **🖼️ Image Editor** - Built-in image editing with Filerobot Image Editor (crop, rotate, filters, annotations)
- **🎵 Audio Editor** - Integrated Audiomass for audio editing and effects
- **🎛️ Export Format Selection** - User-selectable export formats with highest quality conversion settings
- **⚙️ Quality Control** - Configurable conversion quality settings for optimal file size/quality balance

### Wikimedia Commons Integration
- **🌍 Direct Publishing** - Upload converted files directly to Wikimedia Commons
- **🤖 AI-Assisted Metadata** - AI-powered title, description, and category suggestions for Commons uploads
- **📝 Rich Metadata Editor** - Complete metadata support including licenses, categories, dates, and descriptions
- **📷 EXIF Data Extraction** - Automatic extraction of photo dates and metadata from image files
- **🎨 Batch Publishing** - Publish multiple files with shared or individual metadata
- **🔒 License Management** - Support for Creative Commons licenses (CC0, CC-BY, CC-BY-SA) and custom licenses

### User Experience
- **📱 Responsive Design** - Clean, spacious UI with tab-based navigation
- **🎬 Interactive Tutorials** - Step-by-step wizards for complex workflows
- **🔔 Smart Notifications** - Optional email notifications when conversions complete
- **📊 Usage Analytics** - Track conversion history and user statistics
- **🎨 Modern UI** - Built with shadcn/ui components and Tailwind CSS

## 🎯 Supported Formats & Conversions

KOWiz supports **user-selectable export formats** - choose your preferred output format for each file!

### Images
**Input Formats:** HEIC, HEIF, WebP, BMP, TGA, RAW formats, plus all Commons-supported formats
**Export Options:**
- **JPEG** - Best for photos, good compression
- **PNG** - Lossless compression, transparency support
- **GIF** - Simple animations, limited colors
- **SVG** - Vector graphics, scalable
- **TIFF** - High quality, large file size
- **XCF (GIMP)** - GIMP project files

### RAW Camera Formats
**Supported:** CR2, CR3, NEF, ARW, DNG, RW2, ORF, RAF
**Export Options:** Same as images (recommended: TIFF for quality, JPEG for size)
**Camera Support:** Canon, Nikon, Sony, Adobe, Panasonic, Olympus, Fujifilm

### Videos
**Input Formats:** MP4, MOV, AVI, MKV, HEVC, H.264, M4V, FLV, WMV
**Export Options:**
- **WebM (VP9)** - Wikimedia Commons standard, excellent compression

### Audio
**Input Formats:** MP3, AAC, M4A, WMA, plus all Commons-supported formats
**Export Options:**
- **OGG Vorbis** - Wikimedia Commons standard, good compression
- **Opus** - Modern codec, better compression than OGG
- **FLAC** - Lossless compression, highest quality
- **WAV** - Uncompressed, maximum compatibility

### Already Commons-Supported (No Conversion Needed)
- **Images:** JPEG, PNG, GIF, SVG, TIFF, XCF, PDF, DJVU
- **Videos:** WebM, OGV
- **Audio:** OGG, OGA, OPUS, WAV, FLAC, MIDI

### Smart Auto-Detection
Choose **"Auto (Recommended)"** and KOWiz will:
- Pick the best format based on input type and quality
- Preserve quality while ensuring Commons compatibility
- Use optimal settings for file size and quality balance

## 🏗️ Architecture

```
Frontend (Next.js 16)
    ↓
API Routes (Upload, Files, Download, Retry, Commons)
    ↓
Services Layer
    ├── FormatDetectionService (Smart categorization)
    ├── ConversionService (FFmpeg/ImageMagick)
    ├── DatabaseService (PostgreSQL operations)
    ├── MinioService (Object storage)
    ├── QueueService (pg-boss jobs)
    └── CommonsService (Wikimedia Commons integration)
    ↓
Infrastructure
    ├── PostgreSQL (File metadata + Job queue)
    ├── MinIO (Raw & processed files)
    ├── FFmpeg/ImageMagick (Conversion engines)
    └── OpenAI API (AI metadata generation)
    ↓
Worker (Background processing with real-time progress)
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

# NextAuth
AUTH_SECRET=your-secret-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Wikimedia OAuth2
AUTH_WIKIMEDIA_ID=your-wikimedia-client-id
AUTH_WIKIMEDIA_SECRET=your-wikimedia-client-secret

# Resend (email notifications)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=notification@kowiz.tsensei.dev

# OpenAI (AI-assisted metadata generation)
OPENAI_API_KEY=your-openai-api-key  # Optional, for AI features
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
1. **File Upload:** Drag and drop files or use the modern Uppy Dashboard for resumable uploads
2. **Folder Upload:** Upload entire folders with recursive file discovery
3. **URL Import:** Import media from YouTube, Vimeo, or direct URLs using yt-dlp
4. **Resumable Uploads:** Large files support pause/resume with TUS protocol
5. **Real-time Preview:** See file details and conversion requirements before upload
6. **Notification Settings:** Opt-in to email notifications when conversions complete

### Queue Tab
1. **Live Progress Tracking:** Monitor active conversions with real-time FFmpeg progress updates
2. **Concurrent Processing:** Watch multiple files process simultaneously
3. **Error Handling:** View detailed error messages and retry failed conversions
4. **Progress Visualization:** Visual progress bars for conversion and upload stages

### Completed Tab
1. **File Management:** Browse, search, and filter all converted files
2. **Media Editors:** Launch built-in image or audio editors for further enhancements
3. **Download Options:** Download both original and converted versions
4. **Commons Publishing:** Direct upload to Wikimedia Commons with AI-assisted metadata
5. **Batch Operations:** Select multiple files for bulk publishing or downloads

### Wikimedia Commons Integration
1. **AI-Assisted Upload:** Use AI to generate titles, descriptions, and categories
2. **EXIF Integration:** Automatic date extraction from image metadata
3. **License Selection:** Choose from Creative Commons licenses or custom licenses
4. **Batch Metadata:** Apply shared metadata to multiple uploads or customize individually
5. **Preview & Review:** See exactly how your files will appear on Commons before publishing

## 🤖 AI Features

KOWiz integrates AI to streamline your Wikimedia Commons workflow:

### AI-Assisted Metadata Generation
- **Smart Title Generation**: Analyzes image content to create descriptive, searchable titles
- **Detailed Descriptions**: AI examines visual elements to generate comprehensive descriptions
- **Category Suggestions**: Suggests relevant Wikimedia Commons categories based on content analysis
- **EXIF Integration**: Automatically extracts and incorporates photo dates from image metadata
- **User Context Enhancement**: Combine AI analysis with your keywords for better results

### AI Workflow
1. **Upload**: Upload your media files as usual
2. **Enable AI**: Toggle AI assistance in the Commons publish wizard
3. **Provide Context**: Optionally add keywords or brief descriptions
4. **AI Processing**: AI analyzes the media and generates metadata
5. **Review & Edit**: Review AI suggestions and make any needed adjustments
6. **Publish**: Upload to Commons with enhanced, AI-assisted metadata

### Requirements
- **OpenAI API Key**: Optional - AI features work without it, but provide enhanced results
- **Image Analysis**: Works best with clear, high-quality images
- **User Privacy**: AI only analyzes your uploaded files, no data is stored externally

## 🎨 UI Components

### Three Main Tabs

1. **Upload** - Focused upload experience with stats and format selection
2. **Queue** - Active monitoring of processing files with real-time progress
3. **Completed** - Browse, edit, and publish converted files

### Key Features
- Drag & drop zone with format selection dropdowns
- Resumable upload dashboard for large files
- Real-time progress bars with FFmpeg integration
- Built-in image and audio editors
- Status filtering and search functionality
- Batch operations for Commons publishing

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
- @uppy/core & @uppy/tus (Resumable uploads)
- react-filerobot-image-editor (Image editing)
- Lucide React (Icons)

**Backend:**
- Next.js API Routes
- NextAuth.js (Wikimedia OAuth2)
- Drizzle ORM
- PostgreSQL 16
- MinIO (S3-compatible storage)
- pg-boss (PostgreSQL-based queue)
- Resend (Email notifications)

**Media Processing:**
- FFmpeg 8.0 (Video/audio conversion)
- ImageMagick (Image processing)
- TUS Protocol (Resumable uploads)
- yt-dlp (URL imports)

**AI Integration:**
- OpenAI API (Metadata generation)
- EXIF data extraction
- Computer vision analysis

**Third-party Integrations:**
- Wikimedia Commons API
- YouTube/Vimeo APIs
- Audiomass (Audio editing)

**Infrastructure:**
- Docker Compose
- Node.js 20+
- GitHub Actions (CI/CD)
- Coolify (Deployment)

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