'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Link2, Youtube, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UrlImportProps {
  onImportSuccess: () => void;
}

export function UrlImport({ onImportSuccess }: UrlImportProps) {
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    setImporting(true);

    try {
      const response = await fetch('/api/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      toast.success(`Successfully queued import: ${data.file.name}`);
      setUrl('');
      onImportSuccess();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to import from URL');
    } finally {
      setImporting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !importing) {
      handleImport();
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Import from URL</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Paste a URL from YouTube, Vimeo, Instagram, TikTok, Twitch, or direct media link
              </p>
              
              <Alert className="mb-4 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Note:</strong> URL imports can be unreliable due to platform restrictions, 
                  bot detection, and rate limiting. Some platforms may block automated downloads or 
                  require authentication. If a download fails, try again later or use direct file upload instead.
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://youtube.com/watch?v=... or https://example.com/video.mp4"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={importing}
                  className="flex-1"
                />
                <Button
                  onClick={handleImport}
                  disabled={!url.trim() || importing}
                  className="min-w-[120px]"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pl-[76px]">
            <div className="flex items-center gap-1.5">
              <Youtube className="h-3.5 w-3.5 text-red-600" />
              <span>YouTube</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
              <span>Vimeo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-pink-600" />
              <span>Instagram</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-slate-900 dark:text-slate-100" />
              <span>TikTok</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-purple-600" />
              <span>Twitch</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
              <span>+1800 more</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

