import React, { useState, useRef } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, selectedFile, disabled = false }) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];

  const maxFileSize = 10 * 1024 * 1024; // 10MB

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return 'File type not supported. Please upload images, PDFs, or Office documents.';
    }
    
    if (file.size > maxFileSize) {
      return 'File size must be less than 10MB.';
    }
    
    return null;
  };

  const handleFileSelect = (file: File) => {
    setUploadError(null);
    
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const removeFile = () => {
    onFileSelect(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      {/* File Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
          dragOver
            ? 'border-primary-500 bg-primary-50'
            : selectedFile
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleInputChange}
          accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center space-x-3">
            <File className="text-green-500" size={24} />
            <div className="text-left">
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFile();
              }}
              className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto text-gray-400" size={32} />
            <div>
              <p className="text-lg font-medium text-gray-700">
                Drop your file here or click to browse
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Supports images, PDFs, and Office documents (max 10MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {uploadError && (
        <div className="mt-3 flex items-center space-x-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}

      {/* File Info */}
      {selectedFile && !uploadError && (
        <div className="mt-3 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p>
            <span className="font-medium">Ready to upload:</span> {selectedFile.name}
          </p>
          <p className="mt-1">
            Add your question below and send to process this file.
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
