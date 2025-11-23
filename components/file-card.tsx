'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Upload,
  RefreshCw,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  ArrowRight,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import type { File } from '@/lib/db/schema';
import { useState } from 'react';

interface FileCardProps {
  file: File;
  onRetry?: () => void;
}

export function FileCard({ file, onRetry }: FileCardProps) {
  const [downloading, setDownloading] = useState<'raw' | 'converted' | null>(null);

  const handleRetry = async () => {
    try {
      const response = await fetch(`/api/files/${file.id}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Retry failed');
      }

      toast.success('File re-queued for conversion');
      onRetry?.();
    } catch (error) {
      console.error('Retry error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to retry');
    }
  };

  const handleDownload = async (type: 'raw' | 'converted') => {
    try {
      setDownloading(type);
      
      // Open download endpoint directly - it will stream the file
      const downloadUrl = `/api/files/${file.id}/download?type=${type}`;
      window.open(downloadUrl, '_blank');
      
      toast.success(`Downloading ${type} file...`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download');
    } finally {
      setDownloading(null);
    }
  };

  const getStatusIcon = () => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'queued':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'converting':
        return <Loader2 className="h-5 w-5 text-orange-600 animate-spin" />;
      case 'uploading':
        return <Upload className="h-5 w-5 text-purple-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = () => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      queued: 'secondary',
      converting: 'default',
      uploading: 'default',
      completed: 'default',
      failed: 'destructive',
    };

    return (
      <Badge variant={variants[file.status] || 'outline'} className="capitalize">
        {file.status}
      </Badge>
    );
  };

  const getCategoryIcon = () => {
    switch (file.category) {
      case 'image':
      case 'raw':
        return <FileImage className="h-6 w-6 text-blue-600" />;
      case 'video':
        return <FileVideo className="h-6 w-6 text-purple-600" />;
      case 'audio':
        return <FileAudio className="h-6 w-6 text-green-600" />;
      default:
        return <FileIcon className="h-6 w-6 text-gray-600" />;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getConversionProgress = () => {
    const statusProgress: Record<string, number> = {
      pending: 0,
      queued: 25,
      converting: 50,
      uploading: 75,
      completed: 100,
      failed: 0,
    };
    return statusProgress[file.status] || 0;
  };

  const needsConversion = file.needsConversion === 'true';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5">{getCategoryIcon()}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate" title={file.name}>
                  {file.name}
                </h3>
                <p className="text-sm text-muted-foreground capitalize">
                  {file.category} • {formatSize(file.size)}
                  {file.importSource && file.importSource !== 'upload' && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      • Imported via {file.importSource === 'youtube' ? 'YouTube' : 'URL'}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              {getStatusBadge()}
            </div>
          </div>

          {/* Format Conversion Info */}
          {needsConversion && file.targetFormat && (
            <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-md p-2">
              <span className="font-medium uppercase text-muted-foreground">
                {file.originalFormat}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium uppercase text-primary">
                {file.targetFormat}
              </span>
              {file.convertedSize && (
                <span className="text-muted-foreground ml-auto">
                  {formatSize(file.convertedSize)}
                </span>
              )}
            </div>
          )}

          {!needsConversion && (
            <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 rounded-md p-2">
              ✓ Commons-compatible format • No conversion needed
            </div>
          )}

          {/* Progress Bar */}
          {file.status !== 'failed' && file.status !== 'completed' && (
            <div className="space-y-1">
              <Progress value={getConversionProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {getConversionProgress()}% complete
              </p>
            </div>
          )}

          {/* Error Message */}
          {file.status === 'failed' && file.errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 rounded-md p-2">
              <p className="font-medium">Error:</p>
              <p className="text-xs mt-1">{file.errorMessage}</p>
            </div>
          )}

          {/* Download Buttons */}
          {file.status !== 'failed' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload('raw')}
                disabled={downloading !== null}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                {downloading === 'raw' ? 'Getting URL...' : 'Download Original'}
              </Button>
              
              {file.processedFilePath && file.status === 'completed' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleDownload('converted')}
                  disabled={downloading !== null}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloading === 'converted' ? 'Getting URL...' : 'Download Converted'}
                </Button>
              )}
            </div>
          )}

          {/* Retry Button */}
          {file.status === 'failed' && (file.retryCount || 0) < 3 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Conversion
            </Button>
          )}

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>Uploaded: {new Date(file.createdAt).toLocaleString()}</span>
            {file.convertedAt && (
              <span>Converted: {new Date(file.convertedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

