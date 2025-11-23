'use client';

import { FileDropzone } from '@/components/file-dropzone';
import { UrlImport } from '@/components/url-import';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Clock, FileText, TrendingUp } from 'lucide-react';
import type { File } from '@/lib/db/schema';

interface UploadTabProps {
  files: File[];
  onUploadSuccess: () => void;
}

export function UploadTab({ files, onUploadSuccess }: UploadTabProps) {
  // Calculate today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayFiles = files.filter(f => new Date(f.createdAt) >= today);
  const todayCompleted = todayFiles.filter(f => f.status === 'completed');
  
  const avgConversionTime = todayCompleted.length > 0
    ? todayCompleted.reduce((acc, f) => {
        if (f.convertedAt && f.createdAt) {
          const diff = new Date(f.convertedAt).getTime() - new Date(f.createdAt).getTime();
          return acc + diff / 1000;
        }
        return acc;
      }, 0) / todayCompleted.length
    : 0;

  // Get recent uploads (last 5)
  const recentUploads = files.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Main Upload Area */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-8">
          <FileDropzone onUploadSuccess={onUploadSuccess} />
        </CardContent>
      </Card>

      {/* Separator */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or
          </span>
        </div>
      </div>

      {/* URL Import */}
      <UrlImport onImportSuccess={onUploadSuccess} />

      {/* Quick Stats */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
          Quick Stats
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {files.length}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total Uploaded
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {todayCompleted.length}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Converted Today
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {avgConversionTime > 0 ? `${avgConversionTime.toFixed(1)}s` : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Avg. Time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recently Uploaded */}
      {recentUploads.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
            Recently Uploaded
          </h3>
          <div className="space-y-2">
            {recentUploads.map((file) => (
              <Card key={file.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${
                        file.status === 'completed' ? 'bg-green-100 dark:bg-green-900' :
                        file.status === 'failed' ? 'bg-red-100 dark:bg-red-900' :
                        'bg-blue-100 dark:bg-blue-900'
                      }`}>
                        {file.category === 'image' && '📸'}
                        {file.category === 'video' && '🎥'}
                        {file.category === 'audio' && '🎵'}
                        {file.category === 'raw' && '📷'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {file.originalFormat.toUpperCase()}
                          {file.targetFormat && ` → ${file.targetFormat.toUpperCase()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === 'completed' && (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-medium">Complete</span>
                        </span>
                      )}
                      {file.status === 'converting' && (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <Clock className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium">Converting</span>
                        </span>
                      )}
                      {file.status === 'queued' && (
                        <span className="text-orange-600 dark:text-orange-400 flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm font-medium">Queued</span>
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

