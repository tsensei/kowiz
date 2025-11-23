'use client';

import { Card, CardContent } from '@/components/ui/card';
import { FileCard } from '@/components/file-card';
import { AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import type { File } from '@/lib/db/schema';

interface QueueTabProps {
  files: File[];
  onRetry: () => void;
}

export function QueueTab({ files, onRetry }: QueueTabProps) {
  const activeFiles = files.filter(f => f.status === 'converting');
  const queuedFiles = files.filter(f => f.status === 'queued' || f.status === 'pending');
  const failedFiles = files.filter(f => f.status === 'failed');
  
  const totalProcessing = activeFiles.length + queuedFiles.length;
  const allFiles = [...activeFiles, ...queuedFiles, ...failedFiles];

  if (allFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-6 bg-green-100 dark:bg-green-900 rounded-full mb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-2xl font-bold mb-2">All caught up!</h3>
        <p className="text-muted-foreground text-center max-w-md">
          No files are currently being processed. Upload new files to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bulk Progress */}
      {totalProcessing > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">
                    Processing Files
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    {activeFiles.length} converting • {queuedFiles.length} in queue
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Conversions */}
      {activeFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            <h3 className="text-lg font-semibold">
              Active ({activeFiles.length})
            </h3>
          </div>
          <div className="space-y-4">
            {activeFiles.map((file) => (
              <FileCard key={file.id} file={file} onRetry={onRetry} />
            ))}
          </div>
        </div>
      )}

      {/* Queued Files */}
      {queuedFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-semibold">
              Queued ({queuedFiles.length})
            </h3>
          </div>
          <div className="space-y-4">
            {queuedFiles.map((file) => (
              <FileCard key={file.id} file={file} onRetry={onRetry} />
            ))}
          </div>
        </div>
      )}

      {/* Failed Files */}
      {failedFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold">
              Failed ({failedFiles.length})
            </h3>
          </div>
          <div className="space-y-4">
            {failedFiles.map((file) => (
              <FileCard key={file.id} file={file} onRetry={onRetry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

