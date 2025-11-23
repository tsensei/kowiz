#!/bin/bash
set -e

echo "🪣 Setting up MinIO buckets..."
echo ""

# Check if mc (MinIO Client) is available
if ! command -v mc &> /dev/null; then
    echo "⚠️  MinIO Client (mc) not found. Installing..."
    
    # Install mc
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install minio/stable/mc
    else
        wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
        chmod +x /usr/local/bin/mc
    fi
fi

# Configure MinIO alias
echo "Configuring MinIO connection..."
mc alias set kowiz http://${MINIO_ENDPOINT}:${MINIO_PORT} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}

# Create buckets
echo "Creating buckets..."
mc mb kowiz/raw-files --ignore-existing
mc mb kowiz/processed-files --ignore-existing

echo "✓ Bucket 'raw-files' ready"
echo "✓ Bucket 'processed-files' ready"

# Set download policy
echo "Setting bucket policies..."
mc anonymous set download kowiz/raw-files
mc anonymous set download kowiz/processed-files

echo ""
echo "✓ MinIO setup completed successfully!"
echo ""
echo "📊 MinIO buckets:"
mc ls kowiz

