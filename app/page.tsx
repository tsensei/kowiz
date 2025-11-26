'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UploadTab } from '@/components/upload-tab';
import { QueueTab } from '@/components/queue-tab';
import { CompletedTab } from '@/components/completed-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { File } from '@/lib/db/schema';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Sparkles, RefreshCw, Upload, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthButton } from '@/components/auth/auth-button';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'upload';
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    // Restore auto-refresh state from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kowiz-auto-refresh');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files?all=true');

      // Handle unauthorized
      if (response.status === 401) {
        router.push('/auth/signin');
        return;
      }

      const data = await response.json();
      setFiles(data.files);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  // Persist auto-refresh preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('kowiz-auto-refresh', JSON.stringify(autoRefresh));
    }
  }, [autoRefresh]);



  useEffect(() => {
    // Only fetch files if authenticated
    if (status !== 'authenticated') return;

    fetchFiles();

    if (!autoRefresh) return;

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchFiles, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, status]);

  const stats = {
    total: files.length,
    completed: files.filter(f => f.status === 'completed').length,
    processing: files.filter(f => f.status === 'converting' || f.status === 'queued' || f.status === 'pending').length,
    failed: files.filter(f => f.status === 'failed').length,
  };

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render the main content if not authenticated (will redirect)
  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Toaster />

      {/* Header */}
      <div className="border-b bg-white dark:bg-slate-900 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto py-4 px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  KOWiz
                </h1>
                <p className="text-xs text-muted-foreground">
                  Wikimedia Commons Converter
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AuthButton />
              {stats.processing > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {stats.processing} processing
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'Live' : 'Paused'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto py-8 px-6 max-w-6xl">
        <Tabs
          value={currentTab}
          onValueChange={(value) => router.push(`/?tab=${value}`)}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="queue" className="relative">
              <Clock className="h-4 w-4 mr-2" />
              Queue
              {stats.processing > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {stats.processing}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed
              {stats.completed > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({stats.completed})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6 mt-6">
            {loading ? (
              <div className="text-center py-20 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                Loading...
              </div>
            ) : (
              <UploadTab files={files} onUploadSuccess={fetchFiles} />
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-6 mt-6">
            {loading ? (
              <div className="text-center py-20 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                Loading...
              </div>
            ) : (
              <QueueTab files={files} onRetry={fetchFiles} />
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-6 mt-6">
            {loading ? (
              <div className="text-center py-20 text-muted-foreground">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                Loading...
              </div>
            ) : (
              <CompletedTab files={files} />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
