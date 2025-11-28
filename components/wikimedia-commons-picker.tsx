'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Image as ImageIcon, CheckCircle2, ExternalLink, RefreshCw, Grid3x3, List } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

interface WikimediaCommonsPickerProps {
    onImportSuccess: () => void;
}

interface WikiImage {
    pageid: number;
    title: string;
    url: string;
    width: number;
    height: number;
    timestamp: string;
    description: string;
    imageinfo: {
        thumburl: string;
        thumbwidth: number;
        thumbheight: number;
        url: string;
        size: number;
        descriptionurl: string;
        extmetadata: {
            LicenseShortName?: { value: string };
            Artist?: { value: string };
            ImageDescription?: { value: string };
        };
    }[];
}

export function WikimediaCommonsPicker({ onImportSuccess }: WikimediaCommonsPickerProps) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [images, setImages] = useState<WikiImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [nextPageToken, setNextPageToken] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    const fetchUserMedia = useCallback(async (continueToken?: string) => {
        if (!session?.user?.username) return;

        setLoading(true);
        try {
            const apiUrl = 'https://commons.wikimedia.org/w/api.php';
            const params = new URLSearchParams({
                action: 'query',
                list: 'allimages',
                aiuser: session.user.username,
                aisort: 'timestamp',
                aidir: 'descending',
                ailimit: '20',
                aiprop: 'url|extmetadata|dimensions|size', // Added size to props
                format: 'json',
                origin: '*',
            });

            if (continueToken) {
                params.append('aicontinue', continueToken);
            }

            const response = await fetch(`${apiUrl}?${params.toString()}`);
            const data = await response.json();

            if (data.query?.allimages) {
                const newImages = data.query.allimages.map((img: any) => ({
                    pageid: Math.random(),
                    title: img.title,
                    url: img.url,
                    width: img.width || 0,
                    height: img.height || 0,
                    timestamp: img.extmetadata?.DateTimeOriginal?.value || img.extmetadata?.DateTime?.value || '',
                    description: img.extmetadata?.ImageDescription?.value || '',
                    imageinfo: [{
                        thumburl: img.url,
                        url: img.url,
                        size: img.size,
                        descriptionurl: img.descriptionurl,
                        extmetadata: img.extmetadata
                    }]
                }));

                setImages(prev => continueToken ? [...prev, ...newImages] : newImages);

                if (data.continue?.aicontinue) {
                    setNextPageToken(data.continue.aicontinue);
                    setHasMore(true);
                } else {
                    setNextPageToken(null);
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error('Error fetching user media:', error);
            toast.error('Failed to load your media from Wikimedia Commons');
        } finally {
            setLoading(false);
        }
    }, [session?.user?.username]);

    // Reset state when dialog opens
    useEffect(() => {
        if (open && session?.user?.username) {
            setImages([]);
            setSelectedFiles(new Set());
            setNextPageToken(null);
            fetchUserMedia();
        }
    }, [open, session?.user?.username, fetchUserMedia]);

    const toggleSelection = (index: number) => {
        const newSelection = new Set(selectedFiles);
        if (newSelection.has(index)) {
            newSelection.delete(index);
        } else {
            newSelection.add(index);
        }
        setSelectedFiles(newSelection);
    };

    const handleImport = async () => {
        if (selectedFiles.size === 0) return;

        setImporting(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const filesToImport = images.filter((_, index) => selectedFiles.has(index));

            for (const file of filesToImport) {
                try {
                    const response = await fetch('/api/import-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: file.url,
                            filename: file.title.replace(/^File:/, ''), // Pass filename for type inference
                            size: file.imageinfo?.[0]?.size || 0 // Pass size if available
                        }),
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    console.error(`Failed to import ${file.title}`, error);
                    failCount++;
                }
            }

            if (successCount > 0) {
                toast.success(`Successfully queued ${successCount} file${successCount !== 1 ? 's' : ''}`);
                onImportSuccess();
                setOpen(false);
            }

            if (failCount > 0) {
                toast.error(`Failed to import ${failCount} file${failCount !== 1 ? 's' : ''}`);
            }

        } catch (error) {
            console.error('Batch import error:', error);
            toast.error('An error occurred during import');
        } finally {
            setImporting(false);
        }
    };

    if (!session) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-auto py-8 border-dashed border-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                            <img src="/Commons-logo.svg" alt="Wikimedia Commons" className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                            <span className="font-semibold block">Select from Wikimedia Commons</span>
                            <span className="text-xs text-muted-foreground">Browse your uploaded files</span>
                        </div>
                    </div>
                </Button>
            </DialogTrigger>

            <DialogContent className="!w-[90vw] !max-w-[90vw] h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between pr-10">
                        <DialogTitle>Your Wikimedia Commons Uploads</DialogTitle>
                        <div className="flex gap-1 border rounded-lg p-1">
                            <Button
                                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('grid')}
                                className="h-7 px-2"
                            >
                                <Grid3x3 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'table' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('table')}
                                className="h-7 px-2"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden min-h-0 relative">
                    <ScrollArea className="h-full pr-4">
                        {images.length === 0 && !loading ? (
                            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                                <ImageIcon className="h-12 w-12 mb-4 opacity-20" />
                                <p>No uploads found for user {session.user.username}</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                                {images.map((image, index) => (
                                    <div
                                        key={`${image.title}-${index}`}
                                        className={cn(
                                            "group relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-all",
                                            selectedFiles.has(index) ? "ring-2 ring-blue-500 border-blue-500" : "hover:border-blue-300"
                                        )}
                                        onClick={() => toggleSelection(index)}
                                    >
                                        <img
                                            src={image.url}
                                            alt={image.title}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />

                                        <div className={cn(
                                            "absolute top-2 right-2 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center transition-colors",
                                            selectedFiles.has(index) ? "bg-blue-500" : "bg-black/30 group-hover:bg-black/50"
                                        )}>
                                            {selectedFiles.has(index) && <CheckCircle2 className="h-4 w-4 text-white" />}
                                        </div>

                                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-xs font-medium text-white truncate mb-1">{image.title.replace(/^File:/, '')}</p>
                                            {image.description && (
                                                <p className="text-[10px] text-slate-200 line-clamp-2">{image.description}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"></TableHead>
                                        <TableHead className="w-16">Preview</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="w-24">Size</TableHead>
                                        <TableHead className="w-28">Dimensions</TableHead>
                                        <TableHead className="w-20">Type</TableHead>
                                        <TableHead className="w-24">License</TableHead>
                                        <TableHead className="w-28">Date Taken</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {images.map((image, index) => {
                                        const ext = image.title.split('.').pop()?.toLowerCase() || '';
                                        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
                                        const license = image.imageinfo[0]?.extmetadata?.LicenseShortName?.value || 'Unknown';
                                        const formatDate = (timestamp: string) => {
                                            if (!timestamp) return 'N/A';
                                            try {
                                                const date = new Date(timestamp);
                                                if (isNaN(date.getTime())) return 'N/A';
                                                return date.toLocaleDateString();
                                            } catch {
                                                return 'N/A';
                                            }
                                        };
                                        const formatBytes = (bytes: number) => {
                                            if (bytes === 0) return '0 B';
                                            const k = 1024;
                                            const sizes = ['B', 'KB', 'MB', 'GB'];
                                            const i = Math.floor(Math.log(bytes) / Math.log(k));
                                            return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
                                        };

                                        return (
                                            <TableRow
                                                key={`${image.title}-${index}`}
                                                className={cn(
                                                    "cursor-pointer",
                                                    selectedFiles.has(index) && "bg-blue-50 dark:bg-blue-900/20"
                                                )}
                                                onClick={() => toggleSelection(index)}
                                            >
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedFiles.has(index)}
                                                        onCheckedChange={() => toggleSelection(index)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <img
                                                        src={image.url}
                                                        alt={image.title}
                                                        className="h-10 w-10 object-cover rounded"
                                                        loading="lazy"
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    <div className="max-w-md truncate">{image.title.replace(/^File:/, '')}</div>
                                                </TableCell>
                                                <TableCell>{formatBytes(image.imageinfo[0]?.size || 0)}</TableCell>
                                                <TableCell className="text-xs">{image.width} × {image.height}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{ext.toUpperCase()}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{license}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {formatDate(image.timestamp)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}

                        {loading && (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                            </div>
                        )}

                        {!loading && hasMore && images.length > 0 && (
                            <div className="flex justify-center py-4">
                                <Button variant="ghost" onClick={() => fetchUserMedia(nextPageToken!)}>
                                    Load More
                                </Button>
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter className="border-t pt-4">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-sm text-muted-foreground">
                            {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleImport}
                                disabled={selectedFiles.size === 0 || importing}
                            >
                                {importing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    'Import Selected'
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
