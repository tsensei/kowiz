import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, FileCheck, Pencil, Music, MoreHorizontal, Loader2, Globe } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';

const ImageEditorModal = dynamic(() => import('./image-editor-modal'), {
  ssr: false,
});
const AudioEditorModal = dynamic(() => import('./audio-editor-modal'), {
  ssr: false,
});
const CommonsPublishWizard = dynamic(() => import('./commons-publish-wizard').then(mod => ({ default: mod.CommonsPublishWizard })), {
  ssr: false,
});
import { toast } from 'sonner';
import type { File } from '@/lib/db/schema';

interface CompletedTabProps {
  files: File[]; // Kept for initial load or fallback, but we'll fetch paginated data
}

export function CompletedTab({ files: initialFiles }: CompletedTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingAudioFile, setEditingAudioFile] = useState<File | null>(null);
  const [publishingFiles, setPublishingFiles] = useState<File[]>([]);

  // Pagination state
  const [data, setData] = useState<File[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rowSelection, setRowSelection] = useState({});

  // Fetch paginated data
  const fetchPaginatedFiles = async (page: number, limit: number, search?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: (page + 1).toString(), // API is 1-indexed
        limit: limit.toString(),
        status: 'completed',
      });

      const response = await fetch(`/api/files?${params.toString()}`);
      const result = await response.json();

      if (result.files) {
        // Client-side filtering for search if API doesn't support it yet
        // Ideally API should handle search, but for now we filter locally if needed
        // or just rely on what we got. 
        // Since we modified the API to return paginated results, we use that.
        // Note: The current API implementation doesn't support search query param yet.
        // For a proper implementation, we should add search support to the API.
        // For now, let's assume the API returns the correct page.
        setData(result.files);
        setPageCount(result.pagination.totalPages);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaginatedFiles(pageIndex, pageSize, searchQuery);
  }, [pageIndex, pageSize]);

  const handleDownload = useCallback(async (fileId: string, type: 'raw' | 'converted') => {
    try {
      setDownloading(`${fileId}-${type}`);
      const downloadUrl = `/api/files/${fileId}/download?type=${type}`;
      window.open(downloadUrl, '_blank');
      toast.success(`Downloading ${type} file...`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download');
    } finally {
      setDownloading(null);
    }
  }, []);

  const handleBulkDownload = useCallback(async (type: 'raw' | 'converted') => {
    const selectedFileIds = Object.keys(rowSelection);

    if (selectedFileIds.length === 0) return;

    try {
      toast.loading(`Preparing ${selectedFileIds.length} files for download...`);

      const response = await fetch('/api/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: selectedFileIds,
          type
        }),
      });

      if (!response.ok) throw new Error('Download failed');

      // Create a blob from the response stream
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kowiz-bulk-${type}-${new Date().toISOString()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss();
      toast.success('Bulk download started');
      setRowSelection({}); // Clear selection
    } catch (error) {
      console.error('Bulk download error:', error);
      toast.dismiss();
      toast.error('Failed to generate bulk download');
    }
  }, [rowSelection]);

  const handleBulkPublishToCommons = useCallback(() => {
    const selectedFileIds = Object.keys(rowSelection);
    const selectedFiles = data.filter((file) => selectedFileIds.includes(file.id));
    setPublishingFiles(selectedFiles);
  }, [rowSelection, data]);

  const formatSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }, []);

  const columns = useMemo<ColumnDef<File>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const file = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              {file.category === 'image' && '📸'}
              {file.category === 'video' && '🎥'}
              {file.category === 'audio' && '🎵'}
              {file.category === 'raw' && '📷'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate max-w-[200px]">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(file.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Conversion',
      cell: ({ row }) => {
        const file = row.original;
        return (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {file.originalFormat.toUpperCase()}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {file.targetFormat?.toUpperCase()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => {
        const file = row.original;
        return (
          <div className="text-sm">
            <div>{formatSize(file.size)}</div>
            {file.convertedSize && (
              <div className="text-xs text-muted-foreground">
                → {formatSize(file.convertedSize)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const file = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleDownload(file.id, 'raw')}>
                <Download className="mr-2 h-4 w-4" />
                Download Original
              </DropdownMenuItem>
              {file.processedFilePath && (
                <DropdownMenuItem onClick={() => handleDownload(file.id, 'converted')}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Converted
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {file.category === 'image' && file.processedFilePath && (
                <DropdownMenuItem onClick={() => setEditingFile(file)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Image
                </DropdownMenuItem>
              )}
              {file.category === 'audio' && file.processedFilePath && (
                <DropdownMenuItem onClick={() => setEditingAudioFile(file)}>
                  <Music className="mr-2 h-4 w-4" />
                  Edit Audio
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPublishingFiles([file])}>
                <Globe className="mr-2 h-4 w-4" />
                Publish to Commons
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleDownload, setEditingFile, setEditingAudioFile, formatSize]);

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-6 relative">
      {/* Data Table */}
      {loading && data.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          pageCount={pageCount}
          pageIndex={pageIndex}
          pageSize={pageSize}
          onPaginationChange={(newPageIndex, newPageSize) => {
            setPageIndex(newPageIndex);
            setPageSize(newPageSize);
          }}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.id}
          searchKey="name"
          columnFilters={[{ id: 'name', value: searchQuery }]}
          onColumnFiltersChange={(updaterOrValue) => {
            // Handle both function and value updates for column filters
            const newFilters = typeof updaterOrValue === 'function'
              ? updaterOrValue([{ id: 'name', value: searchQuery }])
              : updaterOrValue;

            const nameFilter = newFilters.find(f => f.id === 'name');
            setSearchQuery((nameFilter?.value as string) || '');
            setPageIndex(0); // Reset to first page on search
          }}
        />
      )}

      {/* Floating Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-900 border shadow-lg rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <span className="font-medium text-sm">
            {selectedCount} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => handleBulkDownload('raw')}>
            <Download className="h-4 w-4 mr-2" />
            Download Original
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkDownload('converted')}>
            <Download className="h-4 w-4 mr-2" />
            Download Converted
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" onClick={handleBulkPublishToCommons}>
            <Globe className="h-4 w-4 mr-2" />
            Publish to Commons
          </Button>
        </div>
      )}

      {/* Image Editor Modal */}
      {editingFile && (
        <ImageEditorModal
          isOpen={!!editingFile}
          onClose={() => setEditingFile(null)}
          imageUrl={`/api/files/${editingFile.id}/download?type=${editingFile.processedFilePath ? 'converted' : 'raw'}`}
          fileName={editingFile.name}
        />
      )}

      {/* Audio Editor Modal */}
      {editingAudioFile && (
        <AudioEditorModal
          isOpen={!!editingAudioFile}
          onClose={() => setEditingAudioFile(null)}
          audioUrl={`/api/files/${editingAudioFile.id}/stream?type=${editingAudioFile.processedFilePath ? 'converted' : 'raw'}`}
          fileName={editingAudioFile.name}
        />
      )}

      {/* Commons Publish Wizard */}
      {publishingFiles.length > 0 && (
        <CommonsPublishWizard
          isOpen={publishingFiles.length > 0}
          onClose={() => {
            setPublishingFiles([]);
            setRowSelection({}); // Clear selection after publish
          }}
          files={publishingFiles}
        />
      )}
    </div>
  );
}

