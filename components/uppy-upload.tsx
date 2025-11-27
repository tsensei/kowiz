'use client';

import { useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import Dashboard from '@uppy/dashboard';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useUserProfile } from '@/hooks/use-user-profile';

interface UppyUploadProps {
  onUploadSuccess: () => void;
}

export function UppyUpload({ onUploadSuccess }: UppyUploadProps) {
  const { profile, loading: profileLoading, refresh: refreshProfile } = useUserProfile();
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [userToggledNotification, setUserToggledNotification] = useState(false);
  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        // maxFileSize can be set based on your requirements, null = unlimited
        maxFileSize: null,
        allowedFileTypes: [
          // Images
          'image/*',
          '.heic',
          '.heif',
          '.cr2',
          '.cr3',
          '.nef',
          '.arw',
          '.dng',
          '.rw2',
          '.orf',
          '.raf',
          // Videos
          'video/*',
          // Audio
          'audio/*',
        ],
      },
      autoProceed: false,
    });

    return uppyInstance;
  });

  const notificationLimit = profile?.notificationQuota.limit ?? 5;
  const remainingNotifications = profile?.notificationQuota.remaining ?? 0;
  const notificationsAvailable = !!profile?.email && remainingNotifications > 0;
  const notificationsDisabledReason = !profile?.email
    ? 'Add an email in your profile to enable notifications.'
    : remainingNotifications <= 0
      ? `You have used all ${notificationLimit}/${notificationLimit} email notifications for today.`
      : '';

  // Auto-enable notifications if available
  useEffect(() => {
    if (!userToggledNotification && profile?.email && (profile.notificationQuota.remaining ?? 0) > 0) {
      setNotifyOnComplete(true);
    }

    if ((profile?.notificationQuota.remaining ?? 0) <= 0 || !profile?.email) {
      setNotifyOnComplete(false);
    }
  }, [profile?.email, profile?.notificationQuota.remaining, userToggledNotification]);

  // Listen for profile updates
  useEffect(() => {
    const listener = () => refreshProfile();
    window.addEventListener('kowiz-profile-updated', listener);
    return () => window.removeEventListener('kowiz-profile-updated', listener);
  }, [refreshProfile]);

  // Configure Uppy plugins once on mount
  useEffect(() => {
    // Only add plugins if they haven't been added yet
    if (!uppy.getPlugin('Tus')) {
      uppy.use(Tus, {
        endpoint: '/api/tus',
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        removeFingerprintOnSuccess: true,
      });
    }

    if (!uppy.getPlugin('Dashboard')) {
      uppy.use(Dashboard, {
        inline: true,
        target: '#uppy-dashboard',
        proudlyDisplayPoweredByUppy: false,
        note: 'Supported formats: Images (HEIC, HEIF, WebP, RAW, JPEG, PNG), Videos (MP4, MOV, AVI, MKV), Audio (MP3, AAC, M4A, WAV)',
        height: 400,
        hideProgressDetails: false,
        hideUploadButton: false,
        theme: 'auto',
        fileManagerSelectionType: 'both',
      });
    }
  }, [uppy]);

  // Setup event handlers
  useEffect(() => {
    // Handle successful uploads
    const handleUploadSuccess = (file: any, response: any) => {
      if (file) {
        toast.success(`${file.name} uploaded successfully!`);
      }
    };

    // Handle complete batch
    const handleComplete = (result: any) => {
      const successful = result.successful?.length || 0;
      const failed = result.failed?.length || 0;

      if (failed > 0) {
        toast.warning(`${successful} of ${successful + failed} files uploaded successfully`);
        result.failed?.forEach((file: any) => {
          toast.error(`${file.name}: ${file.error || 'Upload failed'}`);
        });
      } else if (successful > 0) {
        toast.success(`All ${successful} file(s) uploaded successfully!`);

        if (notifyOnComplete && notificationsAvailable) {
          toast.message('Notification scheduled', {
            description: `We will email ${profile?.email} when this batch finishes.`,
          });
          refreshProfile();
        }
      }

      // Trigger refresh of file list
      if (successful > 0) {
        onUploadSuccess();
      }
    };

    // Handle upload errors
    const handleUploadError = (file: any, error: any) => {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${file?.name}: ${error.message}`);
    };

    // Handle upload retry
    const handleUploadRetry = (fileId: any) => {
      if (typeof fileId === 'string') {
        const file = uppy.getFile(fileId);
        if (file) {
          toast.info(`Retrying upload for ${file.name}...`);
        }
      }
    };

    uppy.on('upload-success', handleUploadSuccess);
    uppy.on('complete', handleComplete);
    uppy.on('upload-error', handleUploadError);
    uppy.on('upload-retry', handleUploadRetry);

    return () => {
      uppy.off('upload-success', handleUploadSuccess);
      uppy.off('complete', handleComplete);
      uppy.off('upload-error', handleUploadError);
      uppy.off('upload-retry', handleUploadRetry);
    };
  }, [uppy, onUploadSuccess, notifyOnComplete, notificationsAvailable, profile?.email, refreshProfile]);

  // Update TUS metadata when notification setting changes
  useEffect(() => {
    if (!uppy) return;

    // Update metadata for all files when notification setting changes
    uppy.getFiles().forEach((file) => {
      uppy.setFileMeta(file.id, {
        notifyOnComplete: notifyOnComplete && notificationsAvailable ? 'true' : 'false',
      });
    });
  }, [uppy, notifyOnComplete, notificationsAvailable]);

  // Set metadata when files are added
  useEffect(() => {
    const handleFileAdded = (file: any) => {
      uppy.setFileMeta(file.id, {
        notifyOnComplete: notifyOnComplete && notificationsAvailable ? 'true' : 'false',
      });
    };

    uppy.on('file-added', handleFileAdded);

    return () => {
      uppy.off('file-added', handleFileAdded);
    };
  }, [uppy, notifyOnComplete, notificationsAvailable]);

  return (
    <div className="space-y-4">
      <div
        id="uppy-dashboard"
        className="border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 transition-colors"
      />

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        <Checkbox
          id="notify-on-complete"
          checked={notifyOnComplete && notificationsAvailable}
          disabled={!notificationsAvailable}
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
    </div>
  );
}
