'use client';

import React from 'react';
import FilerobotImageEditor from 'react-filerobot-image-editor';
import Konva from 'konva';

// Fix for low quality preview - using 3 instead of 10 to avoid performance issues
Konva.pixelRatio = 3;


interface ImageEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    fileName: string;
}

export default function ImageEditorModal({
    isOpen,
    onClose,
    imageUrl,
    fileName,
}: ImageEditorModalProps) {
    // Handle save by downloading the file
    const handleSave = (editedImageObject: any) => {
        try {
            // Create a download link for the edited image
            const downloadLink = document.createElement('a');
            downloadLink.href = editedImageObject.imageBase64;
            downloadLink.download = `edited-${fileName}`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            // Close modal after save
            onClose();
        } catch (error) {
            console.error('Error saving image:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-[95vw] h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl">
                <FilerobotImageEditor
                    source={imageUrl}
                    onSave={(editedImageObject, designState) => handleSave(editedImageObject)}
                    onClose={onClose}
                    annotationsCommon={{
                        fill: '#ff0000',
                    }}
                    Text={{ text: 'Filerobot...' }}
                    Rotate={{ angle: 90, componentType: 'slider' }}
                    tabsIds={['Adjust', 'Annotate', 'Watermark', 'Filters', 'Finetune', 'Resize']}
                    defaultTabId="Adjust"
                    defaultToolId="Crop"
                    savingPixelRatio={1}
                    previewPixelRatio={1}
                    defaultSavedImageQuality={1}
                />
            </div>
        </div>
    );
}
