'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { CalendarDays, CheckCircle2, Lock, Shield, Sparkles, X, Loader2, Globe, AlertCircle, Wand2 } from 'lucide-react';
import type { File } from '@/lib/db/schema';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import type { CommonsMetadata, CommonsPublishItem, CommonsPublishResult } from '@/types/commons';

type ReleaseChoice = 'own' | 'other' | 'ai';

type CommonsPublishWizardProps = {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
};

const licenseOptions = [
  {
    id: 'cc0',
    label: 'Creative Commons CC0 Waiver',
    shortLabel: 'CC0',
    value: '{{Cc-zero}}',
    description: 'Release all rights and dedicate to the public domain',
  },
  {
    id: 'cc-by',
    label: 'Creative Commons Attribution 4.0',
    shortLabel: 'CC-BY 4.0',
    value: '{{Cc-by-4.0}}',
    description: 'Credit required when people reuse this work',
  },
  {
    id: 'cc-by-sa',
    label: 'Creative Commons Attribution ShareAlike 4.0',
    shortLabel: 'CC-BY-SA 4.0',
    value: '{{Cc-by-sa-4.0}}',
    description: 'Credit + share alike when reused',
  },
  {
    id: 'other',
    label: 'Other free license',
    shortLabel: 'Custom',
    value: '',
    description: 'Provide another Commons-compatible free license',
  },
];

export function CommonsPublishWizard({ isOpen, onClose, files }: CommonsPublishWizardProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [releaseChoice, setReleaseChoice] = useState<ReleaseChoice>('own');
  const [selectedLicense, setSelectedLicense] = useState<string>(licenseOptions[2].value); // default CC-BY-SA
  const [customLicense, setCustomLicense] = useState('');
  const [applyIndividually, setApplyIndividually] = useState(false);
  const [sharedMeta, setSharedMeta] = useState<CommonsMetadata>({
    filename: '',
    description: '',
    license: licenseOptions[2].value,
    categories: [],
    author: `[[User:${session?.user?.username || ''}]]`,
    date: new Date().toISOString().slice(0, 10),
    source: '{{own}}',
  });
  const [perFileMeta, setPerFileMeta] = useState<Record<string, CommonsMetadata>>({});
  const [categoryDraft, setCategoryDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<CommonsPublishResult[]>([]);
  const [generatingForFile, setGeneratingForFile] = useState<string | null>(null);
  const [aiAssistanceEnabled, setAiAssistanceEnabled] = useState<boolean>(false);
  const [showContextDialog, setShowContextDialog] = useState<boolean>(false);
  const [userContext, setUserContext] = useState<string>('');
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);

  // Check if AI assistance is enabled
  useEffect(() => {
    const checkAiEnabled = async () => {
      try {
        const response = await fetch('/api/commons/ai-enabled');
        if (response.ok) {
          const data = await response.json();
          setAiAssistanceEnabled(data.enabled);
        }
      } catch (error) {
        console.error('Failed to check AI assistance status:', error);
        setAiAssistanceEnabled(false);
      }
    };
    checkAiEnabled();
  }, []);

  useEffect(() => {
    const initializeMetadata = async () => {
      if (isOpen && files.length > 0) {
        setSelectedLicense(licenseOptions[2].value);
        setCustomLicense('');
        setReleaseChoice('own');
        const baseAuthor = `[[User:${session?.user?.username || session?.user?.name || ''}]]`;
        const currentDate = new Date().toISOString().slice(0, 10);

        // Extract EXIF dates for all image files
        const imageFileIds = files.filter(f => f.category === 'image').map(f => f.id);
        let exifDates: Record<string, string | null> = {};

        if (imageFileIds.length > 0) {
          try {
            const response = await fetch('/api/commons/extract-exif', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileIds: imageFileIds }),
            });

            if (response.ok) {
              const data = await response.json();
              exifDates = data.exifDates || {};
            }
          } catch (error) {
            console.error('Failed to extract EXIF dates:', error);
          }
        }

        const baseMeta: CommonsMetadata = {
          filename: '',
          description: '',
          license: licenseOptions[2].value,
          categories: [],
          author: baseAuthor,
          date: currentDate,
          source: '{{own}}',
        };

        const initialMeta = files.reduce<Record<string, CommonsMetadata>>((acc, file) => {
          // Use EXIF date if available, otherwise use current date
          const dateToUse = exifDates[file.id] || currentDate;

          acc[file.id] = {
            ...baseMeta,
            filename: sanitizeFilename(file.name),
            date: dateToUse,
          };
          return acc;
        }, {});

        // For shared metadata, use EXIF date from first image file if available
        const firstImageExifDate = imageFileIds.length > 0 ? exifDates[imageFileIds[0]] : null;
        const sharedDate = firstImageExifDate || currentDate;

        setSharedMeta({ ...baseMeta, date: sharedDate });
        setPerFileMeta(initialMeta);
        setStep(0);
        setApplyIndividually(files.length === 1 ? true : false); // Auto-enable for single file
        setCategoryDraft('');
        setResults([]);
      }
    };

    initializeMetadata();
  }, [isOpen, files, session?.user?.username, session?.user?.name]);

  const steps = ['Release rights', 'License', 'Metadata', 'Review'];

  const activeLicense = selectedLicense || customLicense;

  const canContinue = useMemo(() => {
    if (step === 0) {
      return releaseChoice === 'own';
    }
    if (step === 1) {
      if (selectedLicense) return true;
      return customLicense.trim().length > 0;
    }
    if (step === 2) {
      if (applyIndividually) {
        return files.every((file) => validateMeta(perFileMeta[file.id]));
      }
      // For shared metadata, at least description should be filled
      return validateSharedMeta(sharedMeta);
    }
    return true;
  }, [step, releaseChoice, selectedLicense, customLicense, applyIndividually, files, perFileMeta, sharedMeta]);

  const addCategory = (fileId?: string) => {
    const value = categoryDraft.trim();
    if (!value) return;
    if (applyIndividually && fileId) {
      setPerFileMeta((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          categories: Array.from(new Set([...prev[fileId].categories, value])),
        },
      }));
    } else {
      setSharedMeta((prev) => ({
        ...prev,
        categories: Array.from(new Set([...prev.categories, value])),
      }));
    }
    setCategoryDraft('');
  };

  const removeCategory = (category: string, fileId?: string) => {
    if (applyIndividually && fileId) {
      setPerFileMeta((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          categories: prev[fileId].categories.filter((c) => c !== category),
        },
      }));
    } else {
      setSharedMeta((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c !== category),
      }));
    }
  };

  const handleMetaChange = (fileId: string | 'shared', field: keyof CommonsMetadata, value: string) => {
    if (applyIndividually && fileId !== 'shared') {
      setPerFileMeta((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          [field]: field === 'filename' ? sanitizeFilename(value) : value,
        },
      }));
    } else {
      setSharedMeta((prev) => ({
        ...prev,
        [field]: field === 'filename' ? sanitizeFilename(value) : value,
      }));
    }
  };

  const goNext = async () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      await handleSubmit();
    }
  };

  const goBack = () => {
    if (step === 0) {
      onClose();
    } else {
      setStep(step - 1);
    }
  };

  const openContextDialog = (fileId: string) => {
    setPendingFileId(fileId);
    setUserContext('');
    setShowContextDialog(true);
  };

  const handleGenerateMetadata = async () => {
    if (!pendingFileId) return;

    setShowContextDialog(false);
    setGeneratingForFile(pendingFileId);

    try {
      const response = await fetch('/api/commons/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: pendingFileId,
          userContext: userContext.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate metadata');
      }

      const aiMetadata = await response.json();

      // Update the metadata for this file
      const extension = files.find((f) => f.id === pendingFileId)?.name.split('.').pop() || 'jpg';
      const filename = `${aiMetadata.title}.${extension}`;

      // Add AI-assisted notice to description
      const descriptionWithNotice = `${aiMetadata.description}\n\n{{AI-assisted}}`;

      if (applyIndividually || files.length === 1) {
        setPerFileMeta((prev) => ({
          ...prev,
          [pendingFileId]: {
            ...prev[pendingFileId],
            filename: sanitizeFilename(filename),
            description: descriptionWithNotice,
            categories: aiMetadata.suggestedCategories,
            // Keep existing date (which was set from EXIF or current date on init)
            // Only override if API returned a different EXIF date
            date: aiMetadata.exifDate || prev[pendingFileId]?.date || new Date().toISOString().slice(0, 10),
          },
        }));
      } else {
        // For shared mode, only update description and categories
        setSharedMeta((prev) => ({
          ...prev,
          description: descriptionWithNotice,
          categories: aiMetadata.suggestedCategories,
          // Keep existing date
          date: aiMetadata.exifDate || prev.date || new Date().toISOString().slice(0, 10),
        }));
      }

      const exifDateMessage = aiMetadata.exifDate
        ? 'Photo date extracted from EXIF metadata'
        : 'Review and edit as needed';

      toast.success('AI-assisted metadata created successfully!', {
        description: exifDateMessage,
      });
    } catch (error: any) {
      console.error('Generate metadata error:', error);
      toast.error('Failed to create AI-assisted metadata', {
        description: error?.message || 'Please try again',
      });
    } finally {
      setGeneratingForFile(null);
      setPendingFileId(null);
      setUserContext('');
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setResults([]);

    const items: CommonsPublishItem[] = files.map((file) => {
      const meta = applyIndividually ? perFileMeta[file.id] : { ...sharedMeta };
      const finalMeta: CommonsMetadata = {
        ...meta,
        license: activeLicense,
      };

      // Use the custom filename if provided, otherwise fall back to sanitized file.name
      if (!finalMeta.filename || finalMeta.filename.trim() === '') {
        finalMeta.filename = sanitizeFilename(file.name);
      }

      return {
        fileId: file.id,
        metadata: finalMeta,
        release: 'own',
      };
    });

    try {
      const response = await fetch('/api/commons/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || 'Commons publish failed. Please check your session and try again.');
        setSubmitting(false);
        return;
      }

      const data = await response.json();
      const uploadResults: CommonsPublishResult[] = data?.results || [];
      setResults(uploadResults);

      const successCount = uploadResults.filter((r) => r.success).length;
      const failureCount = uploadResults.length - successCount;

      if (successCount > 0) {
        toast.success(`Published ${successCount} file${successCount !== 1 ? 's' : ''} to Commons!`, {
          description: 'View your uploads on Wikimedia Commons',
        });
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} file${failureCount !== 1 ? 's' : ''} failed to publish`, {
          description: 'Check the errors below for details',
        });
      }

      if (failureCount === 0) {
        setTimeout(() => onClose(), 2000); // Close after showing success
      }
    } catch (error) {
      console.error('Commons publish error', error);
      toast.error('Failed to publish to Commons');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!w-[95vw] !max-w-[1200px] h-[88vh] flex flex-col p-6">
        <DialogHeader className="pr-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-primary" />
              <DialogTitle>Publish to Wikimedia Commons</DialogTitle>
            </div>
            <div className="text-sm text-muted-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {steps.map((label, index) => (
              <div key={label} className="flex-1 flex items-center gap-2">
                <div
                  className={cn(
                    'h-9 w-9 rounded-full border flex items-center justify-center text-sm font-medium transition-all',
                    step === index
                      ? 'bg-primary text-primary-foreground border-primary'
                      : step > index
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  {index + 1}
                </div>
                <span className="text-sm text-muted-foreground hidden sm:inline">{label}</span>
                {index < steps.length - 1 && <Separator className="flex-1" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-6 flex-1 overflow-y-auto pr-2 -mr-2">
          {/* Step 1: Release Rights */}
          {step === 0 && (
            <div className="space-y-4 p-1">
              <p className="text-sm text-muted-foreground">
                All media uploaded to Wikimedia Commons must be free for anyone to use and share. Please confirm the copyright status of your files.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: 'own',
                    title: 'These works are entirely created by me',
                    icon: Shield,
                    enabled: true,
                    helper: 'You own the copyright and can freely license these works',
                  },
                  {
                    id: 'other',
                    title: 'These works contain the work of others',
                    icon: Lock,
                    enabled: false,
                    helper: 'Not yet supported in KOWiz',
                  },
                  {
                    id: 'ai',
                    title: 'Generated using AI tools',
                    icon: Sparkles,
                    enabled: false,
                    helper: 'AI-generated content has special guidelines on Commons',
                  },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      className={cn(
                        'border rounded-xl p-6 text-left transition-all',
                        releaseChoice === option.id ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'hover:border-primary/50',
                        !option.enabled && 'opacity-50 cursor-not-allowed'
                      )}
                      onClick={() => option.enabled && setReleaseChoice(option.id as ReleaseChoice)}
                      type="button"
                      disabled={!option.enabled}
                    >
                      <div className="space-y-3">
                        <Icon className={cn('h-6 w-6', option.enabled ? 'text-primary' : 'text-muted-foreground')} />
                        <div>
                          <p className="font-medium">{option.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{option.helper}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: License */}
          {step === 1 && (
            <div className="space-y-4 p-1">
              <p className="text-sm text-muted-foreground">
                Choose a free license for your works. This determines how others can use your media on Wikipedia and beyond.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {licenseOptions.map((license) => (
                  <button
                    key={license.id}
                    type="button"
                    onClick={() => {
                      setSelectedLicense(license.value);
                      if (license.id !== 'other') setCustomLicense('');
                    }}
                    className={cn(
                      'border rounded-xl p-4 text-left transition-all',
                      selectedLicense === license.value || (!selectedLicense && license.id === 'other')
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                        : 'hover:border-primary/40'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className={cn('h-5 w-5 mt-0.5', selectedLicense === license.value ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <div className="space-y-2 flex-1">
                        <p className="font-medium">{license.label}</p>
                        <p className="text-sm text-muted-foreground">{license.description}</p>
                        {license.id === 'other' && (
                          <Input
                            className="mt-3"
                            placeholder="e.g. {{PD-old-100}}"
                            value={customLicense}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setSelectedLicense('');
                              setCustomLicense(e.target.value);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Metadata */}
          {step === 2 && (
            <div className="space-y-6 p-1">
              {files.length > 1 && (
                <div className="flex items-center justify-between border rounded-lg p-4">
                  <div>
                    <p className="font-medium">Provide information for each individual file</p>
                    <p className="text-sm text-muted-foreground">Toggle on to customize title, description, or categories per file</p>
                  </div>
                  <Switch checked={applyIndividually} onCheckedChange={setApplyIndividually} />
                </div>
              )}

              {!applyIndividually && files.length > 1 && (
                <>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Shared metadata mode
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Each file will use its original filename. Provide a general description that applies to all files.
                    </p>
                  </div>
                  {aiAssistanceEnabled && files.length === 1 && files[0].category === 'image' && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openContextDialog(files[0].id)}
                        disabled={generatingForFile === files[0].id}
                      >
                        {generatingForFile === files[0].id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            AI-assisted metadata
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  <MetadataForm
                    metadata={sharedMeta}
                    onChange={(field, value) => handleMetaChange('shared', field, value)}
                    categoryDraft={categoryDraft}
                    setCategoryDraft={setCategoryDraft}
                    onAddCategory={() => addCategory()}
                    onRemoveCategory={removeCategory}
                    activeLicense={activeLicense}
                    hideFilename={true}
                  />
                </>
              )}

              {(applyIndividually || files.length === 1) && (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  {files.map((file) => (
                    <div key={file.id} className="rounded-xl border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{file.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{file.category}</p>
                        </div>
                        {aiAssistanceEnabled && file.category === 'image' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openContextDialog(file.id)}
                            disabled={generatingForFile === file.id}
                          >
                            {generatingForFile === file.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Wand2 className="h-4 w-4 mr-2" />
                                AI-assisted
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <MetadataForm
                        metadata={perFileMeta[file.id] || sharedMeta}
                        onChange={(field, value) => handleMetaChange(file.id, field, value)}
                        categoryDraft={categoryDraft}
                        setCategoryDraft={setCategoryDraft}
                        onAddCategory={() => addCategory(file.id)}
                        onRemoveCategory={(category) => removeCategory(category, file.id)}
                        activeLicense={activeLicense}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-4 p-1">
              {results.length > 0 ? (
                // Show results
                <div className="space-y-3">
                  {results.map((result) => {
                    const file = files.find((f) => f.id === result.fileId);
                    return (
                      <div
                        key={result.fileId}
                        className={cn(
                          'border rounded-lg p-4',
                          result.success ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{file?.name}</p>
                            {result.success && result.descriptionUrl && (
                              <a
                                href={result.descriptionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                              >
                                View on Commons
                                <Globe className="h-3 w-3" />
                              </a>
                            )}
                            {!result.success && result.error && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{result.error}</p>}
                          </div>
                          <Badge variant={result.success ? 'default' : 'destructive'}>{result.success ? 'Success' : 'Failed'}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Show preview
                <>
                  <p className="text-sm text-muted-foreground">Review your files before publishing to Wikimedia Commons.</p>
                  {files.map((file) => {
                    const meta = applyIndividually ? perFileMeta[file.id] : { ...sharedMeta, filename: sanitizeFilename(file.name) };
                    return (
                      <div key={file.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-semibold">{meta.filename || file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.category} • {file.targetFormat?.toUpperCase() || file.originalFormat.toUpperCase()}
                            </p>
                          </div>
                          <Badge variant="outline">{licenseOptions.find((l) => l.value === activeLicense)?.shortLabel || 'Custom'}</Badge>
                        </div>
                        <div className="rounded-md bg-muted/60 p-3 text-xs space-y-1 font-mono">
                          <div>{'== {{int:filedesc}} =='}</div>
                          <div>{'{{Information'}</div>
                          <div className="pl-2">|description = {meta.description || '—'}</div>
                          <div className="pl-2">|source = {meta.source}</div>
                          <div className="pl-2">|author = {meta.author || '—'}</div>
                          <div className="pl-2">|date = {meta.date}</div>
                          <div>{'}}'}</div>
                          <div />
                          <div>{'== {{int:license-header}} =='}</div>
                          <div>{activeLicense || '—'}</div>
                          {meta.categories.length > 0 && (
                            <div className="pt-2">
                              {meta.categories.map((cat) => (
                                <span key={cat} className="block">
                                  [[Category:{cat}]]
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-6">
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Publishing as {session?.user?.username || 'logged-in user'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack} disabled={submitting}>
                {step === 0 ? 'Cancel' : 'Back'}
              </Button>
              <Button onClick={goNext} disabled={!canContinue || submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : step === steps.length - 1 && results.length === 0 ? (
                  'Publish to Commons'
                ) : step === steps.length - 1 ? (
                  'Close'
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* AI-Assisted Context Input Dialog */}
      <Dialog open={showContextDialog} onOpenChange={setShowContextDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              AI-Assisted Metadata Creation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="userContext">Provide some keywords or context (optional)</Label>
              <Textarea
                id="userContext"
                placeholder="Example: Golden Gate Bridge at sunset, San Francisco, 2024"
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Provide 5-10 keywords or a brief description. AI will analyze the image and enhance your input to create a detailed description.
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>AI-Assisted workflow:</strong> You provide the core context, AI enhances it by analyzing the image. The description will be tagged as "AI-assisted" on Commons.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContextDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateMetadata}>
              <Wand2 className="h-4 w-4 mr-2" />
              Create Metadata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

type MetadataFormProps = {
  metadata: CommonsMetadata;
  onChange: (field: keyof CommonsMetadata, value: string) => void;
  categoryDraft: string;
  setCategoryDraft: (value: string) => void;
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
  activeLicense: string;
  hideFilename?: boolean;
};

function MetadataForm({
  metadata,
  onChange,
  categoryDraft,
  setCategoryDraft,
  onAddCategory,
  onRemoveCategory,
  activeLicense,
  hideFilename,
}: MetadataFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!hideFilename && (
          <div className="space-y-2">
            <Label>Title / filename *</Label>
            <Input value={metadata.filename} onChange={(e) => onChange('filename', e.target.value)} placeholder="Example_photo.jpg" />
            <p className="text-xs text-muted-foreground">Use descriptive names (avoid IMG_1234.jpg)</p>
          </div>
        )}
        <div className="space-y-2">
          <Label>Date created *</Label>
          <Input type="date" value={metadata.date} onChange={(e) => onChange('date', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description *</Label>
        <Textarea
          value={metadata.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Describe what this media shows. Add key details and context."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Author *</Label>
          <Input value={metadata.author} onChange={(e) => onChange('author', e.target.value)} placeholder="[[User:YourUsername]]" />
        </div>
        <div className="space-y-2">
          <Label>Source</Label>
          <Input value={metadata.source} onChange={(e) => onChange('source', e.target.value)} disabled />
          <p className="text-xs text-muted-foreground">Own work uploads only</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categories</Label>
        <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2 min-h-[42px]">
          {metadata.categories.map((category) => (
            <Badge key={category} variant="secondary" className="flex items-center gap-1">
              {category}
              <button type="button" onClick={() => onRemoveCategory(category)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddCategory();
              }
            }}
            placeholder="Add category and press Enter"
            className="flex-1 min-w-[180px] border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <p className="text-xs text-muted-foreground">Help others find your media by adding relevant categories</p>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium">License preview</p>
        <p className="text-muted-foreground mt-1">{activeLicense || 'Custom license will be used'}</p>
      </div>
    </div>
  );
}

function sanitizeFilename(value: string) {
  // Basic sanitization - you can enhance this
  return value.replace(/[<>:"/\\|?*]/g, '_');
}

function validateMeta(meta?: CommonsMetadata) {
  if (!meta) return false;
  return Boolean(meta.filename && meta.description && meta.author && meta.date);
}

function validateSharedMeta(meta?: CommonsMetadata) {
  if (!meta) return false;
  // For shared metadata, filename is optional (will use original filenames)
  return Boolean(meta.description && meta.author && meta.date);
}
