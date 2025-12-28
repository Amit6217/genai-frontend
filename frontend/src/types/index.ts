export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  type: 'text' | 'file' | 'voice';
  fileInfo?: FileInfo;
}

export interface FileInfo {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
}

export interface ChatResponse {
  success: boolean;
  response: {
    answers: Array<{ answer: string }>;
  } | string; // Support both new format and legacy string format
  timestamp: string;
  conversation_id?: string;
  file?: {
    originalName: string;
    mimetype: string;
    size: number;
  };
  questions?: string[];
  originalText?: string;
}

export interface VoiceRecognitionProps {
  onTranscription: (text: string) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
}

// HackRX API specific types
export interface HackRXUploadResponse {
  pdf_id: string;
  message: string;
}

export interface HackRXQueryResponse {
  answer: {
    answer: string;
  };
}
