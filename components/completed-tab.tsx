'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, FileCheck, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';

const ImageEditorModal = dynamic(() => import('./image-editor-modal'), {
  ssr: false,
});
import { toast } from 'sonner';
import type { File } from '@/lib/db/schema';

interface CompletedTabProps {
  files: File[];
}

export function CompletedTab({ files }: CompletedTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<File | null>(null);

  const completedFiles = files.filter(f => f.status === 'completed');

  const filteredFiles = completedFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownload = async (fileId: string, type: 'raw' | 'converted') => {
    try {
      setDownloading(`${fileId}-${type}`);

      // Open download endpoint directly - it will stream the file
      const downloadUrl = `/api/files/${fileId}/download?type=${type}`;
      window.open(downloadUrl, '_blank');

      toast.success(`Downloading ${type} file...`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download');
    } finally {
      setDownloading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (completedFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-full mb-6">
          <FileCheck className="h-12 w-12 text-slate-400" />
        </div>
        <h3 className="text-2xl font-bold mb-2">No completed files yet</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Once your files are converted, they'll appear here for easy access and download.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <Card className="border-l-4 border-l-green-500">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">
                {completedFiles.length} Files Converted
              </h3>
              <p className="text-muted-foreground mt-1">
                Ready to download and use
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Files List */}
      <div className="space-y-3">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No files found matching "{searchQuery}"
          </div>
        ) : (
          filteredFiles.map((file) => (
            <Card key={file.id} className="border-0 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                        {file.category === 'image' && '📸'}
                        {file.category === 'video' && '🎥'}
                        {file.category === 'audio' && '🎵'}
                        {file.category === 'raw' && '📷'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">{file.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatTimeAgo(file.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Conversion Info */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {file.originalFormat.toUpperCase()}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {file.targetFormat?.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        {formatSize(file.size)}
                        {file.convertedSize && ` → ${formatSize(file.convertedSize)}`}
                      </span>
                    </div>
                  </div>

                  {/* Download Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(file.id, 'raw')}
                      disabled={downloading !== null}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Original
                    </Button>
                    {file.processedFilePath && (
                      <Button
                        size="sm"
                        onClick={() => handleDownload(file.id, 'converted')}
                        disabled={downloading !== null}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Converted
                      </Button>
                    )}

                    {/* Edit Button for Images */}
                    {file.category === 'image' && file.processedFilePath && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setEditingFile(file)}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Image
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>


      {/* Image Editor Modal */}
      {
        editingFile && (
          <ImageEditorModal
            isOpen={!!editingFile}
            onClose={() => setEditingFile(null)}
            imageUrl={`/api/files/${editingFile.id}/download?type=${editingFile.processedFilePath ? 'converted' : 'raw'}`}
            fileName={editingFile.name}
          />
        )
      }
    </div >
  );
}

