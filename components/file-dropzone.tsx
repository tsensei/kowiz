'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage, FileVideo, FileAudio, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserProfile } from '@/hooks/use-user-profile';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

interface UploadResult {
  success: boolean;
  fileName: string;
  error?: string;
}

interface UploadResponse {
  successfulUploads: number;
  totalFiles: number;
  failedUploads: number;
  results: UploadResult[];
}

interface FileDropzoneProps {
  onUploadSuccess: () => void;
}

export function FileDropzone({ onUploadSuccess }: FileDropzoneProps) {
  const { profile, loading: profileLoading, refresh: refreshProfile } = useUserProfile();
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<Record<number, string>>({}); // index -> targetFormat
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [userToggledNotification, setUserToggledNotification] = useState(false);
  const notificationLimit = profile?.notificationQuota.limit ?? 5;
  const remainingNotifications = profile?.notificationQuota.remaining ?? 0;
  const notificationsAvailable = !!profile?.email && remainingNotifications > 0;
  const notificationsDisabledReason = !profile?.email
    ? 'Add an email in your profile to enable notifications.'
    : remainingNotifications <= 0
      ? `You have used all ${notificationLimit}/${notificationLimit} email notifications for today.`
      : '';

  // Initialize Uppy instance
  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        allowedFileTypes: [
          'image/*', 'video/*', 'audio/*',
          '.heic', '.heif', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.rw2', '.orf', '.raf'
        ],
      },
      autoProceed: false,
    });

    return uppyInstance;
  });

  useEffect(() => {
    if (!userToggledNotification && profile?.email && (profile.notificationQuota.remaining ?? 0) > 0) {
      setNotifyOnComplete(true);
    }

    if ((profile?.notificationQuota.remaining ?? 0) <= 0 || !profile?.email) {
      setNotifyOnComplete(false);
    }
  }, [profile?.email, profile?.notificationQuota.remaining, userToggledNotification]);

  useEffect(() => {
    const listener = () => refreshProfile();
    window.addEventListener('kowiz-profile-updated', listener);
    return () => window.removeEventListener('kowiz-profile-updated', listener);
  }, [refreshProfile]);

  // Initialize Uppy TUS plugin
  useEffect(() => {
    if (!uppy.getPlugin('Tus')) {
      // Use absolute URL with proper protocol to avoid mixed content issues
      const endpoint = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}/api/tus`
        : '/api/tus';

      uppy.use(Tus, {
        endpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024,
        removeFingerprintOnSuccess: true,
      });
    }

    // Track progress with better granularity
    const handleProgress = (progress: number) => {
      setUploadProgress(progress);
    };

    // Track individual file upload progress for accurate byte count
    const handleFileProgress = (file: any, progress: any) => {
      const files = uppy.getFiles();
      const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

      // Calculate total uploaded bytes across all files
      let totalUploaded = 0;
      files.forEach((f) => {
        const fileProgress = f.progress?.percentage || 0;
        const fileSize = f.size || 0;
        totalUploaded += Math.floor((fileProgress / 100) * fileSize);
      });

      setUploadedBytes(totalUploaded);
      setTotalBytes(totalSize);
    };

    // Handle upload success
    const handleUploadSuccess = (file: any) => {
      if (file) {
        toast.success(`${file.name} uploaded successfully!`);
      }
    };

    // Handle completion
    const handleComplete = (result: any) => {
      const successful = result.successful?.length || 0;
      const failed = result.failed?.length || 0;

      setUploading(false);
      setUploadProgress(0);
      setUploadedBytes(0);
      setTotalBytes(0);

      if (failed > 0) {
        toast.warning(`${successful} of ${successful + failed} files uploaded successfully`);
        result.failed?.forEach((file: any) => {
          toast.error(`${file.name}: ${file.error || 'Upload failed'}`);
        });
      } else if (successful > 0) {
        toast.success(`Successfully uploaded ${successful} file(s)!`);

        if (notifyOnComplete && notificationsAvailable) {
          toast.message('Notification scheduled', {
            description: `We will email ${profile?.email} when this batch finishes.`,
          });
          refreshProfile();
        }
      }

      // Clear files from Uppy and our state
      uppy.cancelAll();
      setSelectedFiles([]);
      setSelectedFormats({});

      if (successful > 0) {
        onUploadSuccess();
      }
    };

    const handleError = (file: any, error: any) => {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${file?.name}: ${error.message}`);
    };

    uppy.on('progress', handleProgress);
    uppy.on('upload-progress', handleFileProgress);
    uppy.on('upload-success', handleUploadSuccess);
    uppy.on('complete', handleComplete);
    uppy.on('upload-error', handleError);

    return () => {
      uppy.off('progress', handleProgress);
      uppy.off('upload-progress', handleFileProgress);
      uppy.off('upload-success', handleUploadSuccess);
      uppy.off('complete', handleComplete);
      uppy.off('upload-error', handleError);
    };
  }, [uppy, onUploadSuccess, notifyOnComplete, notificationsAvailable, profile?.email, refreshProfile]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    // useFsAccessApi: false, // Use traditional file input for folder support
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);

    try {
      // Add files to Uppy
      selectedFiles.forEach((file, index) => {
        uppy.addFile({
          name: file.name,
          type: file.type,
          data: file,
          meta: {
            notifyOnComplete: (notifyOnComplete && notificationsAvailable) ? 'true' : 'false',
            targetFormat: selectedFormats[index] || 'auto',
          },
        });
      });

      // Start upload
      await uppy.upload();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload files');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <FileImage className="h-5 w-5" />;
    if (file.type.startsWith('video/')) return <FileVideo className="h-5 w-5" />;
    if (file.type.startsWith('audio/')) return <FileAudio className="h-5 w-5" />;
    return <FileIcon className="h-5 w-5" />;
  };

  const getExportOptions = (file: File): { value: string; label: string }[] => {
    const mimeType = file.type || '';
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (mimeType.startsWith('image/') || extension?.match(/^(heic|heif|cr2|cr3|nef|arw|dng|rw2|orf|raf)$/)) {
      return [
        { value: 'auto', label: 'Auto (Recommended)' },
        { value: 'jpeg', label: 'JPEG' },
        { value: 'png', label: 'PNG' },
        { value: 'gif', label: 'GIF' },
        { value: 'svg', label: 'SVG' },
        { value: 'tiff', label: 'TIFF' },
        { value: 'xcf', label: 'XCF (GIMP)' },
      ];
    } else if (mimeType.startsWith('video/')) {
      return [
        { value: 'auto', label: 'Auto (Recommended)' },
        { value: 'webm', label: 'WebM (VP9)' },
      ];
    } else if (mimeType.startsWith('audio/')) {
      return [
        { value: 'auto', label: 'Auto (Recommended)' },
        { value: 'ogg', label: 'OGG Vorbis' },
        { value: 'opus', label: 'Opus' },
        { value: 'flac', label: 'FLAC (Lossless)' },
        { value: 'wav', label: 'WAV (Uncompressed)' },
      ];
    }

    return [{ value: 'auto', label: 'Auto (Recommended)' }];
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
        // @ts-expect-error - webkitdirectory is not in types but is standard
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

          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
            <Checkbox
              id="notify-on-complete"
              checked={notifyOnComplete && notificationsAvailable}
              disabled={uploading || !notificationsAvailable}
              onCheckedChange={(checked) => {
                setUserToggledNotification(true);
                setNotifyOnComplete(Boolean(checked));
              }}
            />
            <div className="space-y-1">
              <Label htmlFor="notify-on-complete" className="font-medium">
                Email me when this batch finishes
              </Label>
              <p className="text-xs text-muted-foreground">
                {profileLoading
                  ? 'Checking notification quota...'
                  : `You have ${remainingNotifications} of ${notificationLimit} notifications left today.`}
              </p>
              {!notificationsAvailable && notificationsDisabledReason && (
                <p className="text-xs text-destructive">{notificationsDisabledReason}</p>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

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
                <Select
                  value={selectedFormats[index] || 'auto'}
                  onValueChange={(value) => {
                    setSelectedFormats((prev) => ({ ...prev, [index]: value }));
                  }}
                  disabled={uploading}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    {getExportOptions(file).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
