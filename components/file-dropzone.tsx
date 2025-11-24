'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage, FileVideo, FileAudio, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onUploadSuccess: () => void;
}

export function FileDropzone({ onUploadSuccess }: FileDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    // @ts-ignore - webkitdirectory is not in the types but works
    useFsAccessApi: false, // Use traditional file input for folder support
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp', '.bmp', '.tiff', '.tif', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.rw2', '.orf', '.raf'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.ogv', '.m4v', '.flv', '.wmv'],
      'audio/*': ['.mp3', '.wav', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wma'],
    },
  });

  // Handler for folder upload
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
      toast.success(`Added ${files.length} files from folder`);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Show detailed feedback
      if (data.failedUploads > 0) {
        // Some files failed
        const failedFiles = data.results
          .filter((r: any) => !r.success)
          .map((r: any) => r.fileName)
          .join(', ');

        toast.warning(
          `${data.successfulUploads} of ${data.totalFiles} files uploaded. Failed: ${failedFiles}`,
          { duration: 5000 }
        );

        // Show individual error details
        data.results.forEach((result: any) => {
          if (!result.success) {
            toast.error(`${result.fileName}: ${result.error}`, { duration: 4000 });
          }
        });
      } else {
        // All succeeded
        toast.success(`Successfully uploaded ${data.successfulUploads} file(s)!`);
      }

      // Clear successfully uploaded files
      if (data.successfulUploads > 0) {
        const failedFileNames = data.results
          .filter((r: any) => !r.success)
          .map((r: any) => r.fileName);

        setSelectedFiles((prev) =>
          prev.filter((file) => failedFileNames.includes(file.name))
        );

        // If all uploaded successfully, reset file input
        if (failedFileNames.length === 0) {
          const fileInput = document.getElementById('file-input') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        }
      }

      onUploadSuccess();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <FileImage className="h-5 w-5" />;
    if (file.type.startsWith('video/')) return <FileVideo className="h-5 w-5" />;
    if (file.type.startsWith('audio/')) return <FileAudio className="h-5 w-5" />;
    return <FileIcon className="h-5 w-5" />;
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} disabled={uploading} />
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-primary/10 p-6">
            <Upload className="h-10 w-10 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold">
              {isDragActive ? 'Drop files here...' : 'Drag & drop media files here'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse your device
            </p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById('folder-input')?.click();
              }}
              disabled={uploading}
            >
              Upload Folder
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Supported formats:</p>
            <p>Images: HEIC, HEIF, WebP, RAW, JPEG, PNG, and more</p>
            <p>Videos: MP4, MOV, AVI, MKV, and more</p>
            <p>Audio: MP3, AAC, M4A, WAV, and more</p>
          </div>
        </div>
      </div>

      {/* Hidden folder input */}
      <input
        id="folder-input"
        type="file"
        // @ts-ignore - webkitdirectory is not in types but is standard
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderSelect}
        className="hidden"
        disabled={uploading}
      />

      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
            </p>
            <Button
              onClick={handleUpload}
              disabled={uploading}
              size="sm"
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
            </Button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="text-muted-foreground">
                  {getFileIcon(file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  disabled={uploading}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

