'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string;
  fileName: string;
}

export default function AudioEditorModal({
  isOpen,
  onClose,
  audioUrl,
  fileName,
}: AudioEditorModalProps) {
  // Build the Audiomass URL with query parameters for auto-loading
  const editorUrl = useMemo(() => {
    // Convert relative URL to absolute URL for iframe
    const absoluteAudioUrl = audioUrl.startsWith('http')
      ? audioUrl
      : `${window.location.origin}${audioUrl}`;

    // Use Audiomass's built-in 'url' parameter
    const params = new URLSearchParams();
    params.set('url', absoluteAudioUrl);
    return `/audiomass/?${params.toString()}`;
  }, [audioUrl, fileName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-[95vw] h-[90vh] bg-neutral-900 rounded-lg overflow-hidden shadow-2xl border border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🎵</div>
            <div>
              <div className="text-sm font-medium text-neutral-200">
                Editing Audio
              </div>
              <div className="text-xs text-neutral-400 font-mono">
                {fileName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="hover:bg-neutral-800"
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
              aria-label="Close modal"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Editor iframe */}
        <iframe
          src={editorUrl}
          className="w-full h-[calc(100%-60px)] border-none bg-black"
          title={`Audiomass Editor - ${fileName}`}
          allow="autoplay; microphone"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
        />

        {/* Footer hint */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-neutral-800/90 backdrop-blur-sm px-4 py-2 rounded-full text-xs text-neutral-300 border border-neutral-600 pointer-events-none">
          Use File → Export to download your edited audio
        </div>
      </div>
    </div>
  );
}
