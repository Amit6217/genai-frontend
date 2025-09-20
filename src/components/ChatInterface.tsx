import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Paperclip } from 'lucide-react';
import { Message } from '../types';
import { apiService } from '../services/api';
import VoiceRecognition from './VoiceRecognition';
import FileUpload from './FileUpload';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // HackRX state management
  const [currentPdfId, setCurrentPdfId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Utility function to extract message content from API response
  const extractMessageContent = (response: any): string => {
    console.log('Extracting message content from response:', response);

    if (typeof response === 'object' && response.answers) {
      // New format: extract answers from the response
      const content = response.answers
        .map((item: any) => item.answer)
        .join('\n\n');
      console.log('Extracted content from answers:', content);
      return content;
    } else if (typeof response === 'string') {
      // Legacy format: direct string
      console.log('Using direct string response:', response);
      return response;
    } else {
      console.log('Unable to extract content from response:', response);
      return 'I received a response but couldn\'t format it properly.';
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  // Counter to ensure unique IDs even when messages are created in the same millisecond
  const messageIdCounter = React.useRef(0);

  const addMessage = (content: string, sender: 'user' | 'assistant', type: 'text' | 'file' | 'voice' = 'text', fileInfo?: any) => {
    // Increment counter for each message to ensure uniqueness
    messageIdCounter.current += 1;

    const newMessage: Message = {
      id: `${Date.now()}-${messageIdCounter.current}`,
      content,
      sender,
      timestamp: new Date(),
      type,
      fileInfo
    };
    setMessages(prev => [...prev, newMessage]);
  };

  // Process input (used by both text and voice)
  const processInput = async (input: string, inputType: 'text' | 'voice' = 'text') => {
    if (!input.trim() && !selectedFile) return;

    const userMessage = input.trim() || (selectedFile ? `[File: ${selectedFile.name}]` : '');
    const messageType = selectedFile ? 'file' : inputType;

    // Add user message
    addMessage(userMessage, 'user', messageType);

    setIsLoading(true);

    try {
      let response;

      if (selectedFile) {
        // File upload workflow
        console.log('📤 Uploading PDF to HackRX for indexing...');
        addMessage('📤 Uploading and indexing your document...', 'assistant');

        const uploadResult = await apiService.uploadPDFToHackRX(selectedFile);
        const pdf_id = uploadResult.pdf_id;

        // Store the PDF ID and filename in state
        setCurrentPdfId(pdf_id);
        setUploadedFileName(selectedFile.name);

        console.log(`✅ PDF uploaded successfully. PDF ID: ${pdf_id}`);
        addMessage(`✅ Document "${selectedFile.name}" has been uploaded and indexed successfully! You can now ask questions about it.`, 'assistant');

        // If there's also a question, query it immediately
        if (input.trim()) {
          console.log(`🔍 Querying PDF ${pdf_id} with question: "${input.trim()}"`);
          const queryResult = await apiService.queryPDFFromHackRX(pdf_id, input.trim());
          addMessage(queryResult.answer.answer, 'assistant');
        }
      } else if (input.trim() && currentPdfId) {
        // Query existing PDF
        console.log(`🔍 Querying existing PDF ${currentPdfId} with question: "${input.trim()}"`);
        const queryResult = await apiService.queryPDFFromHackRX(currentPdfId, input.trim());
        addMessage(queryResult.answer.answer, 'assistant');
      } else if (input.trim()) {
        // Text only - general chat
        response = await apiService.sendMessage(input.trim(), conversationId || undefined);

        if (response.success) {
          const messageContent = extractMessageContent(response.response);
          addMessage(messageContent, 'assistant');

          if (response.conversation_id && !conversationId) {
            setConversationId(response.conversation_id);
          }
        } else {
          console.error('API returned unsuccessful response:', response);
          addMessage(`Sorry, I encountered an error processing your ${inputType}.`, 'assistant');
        }
      }
    } catch (error: any) {
      console.error(`Error processing ${inputType}:`, error);

      let errorMessage = `Sorry, I could not connect to the server. Please try again later.`;

      if (error.response) {
        // Server responded with an error
        const statusCode = error.response.status;
        const errorData = error.response.data;

        if (statusCode === 400) {
          errorMessage = `Invalid request: ${errorData.error || 'Please check your input.'}`;
        } else if (statusCode === 404) {
          errorMessage = 'The requested endpoint was not found. Please check your server configuration.';
        } else if (statusCode === 500) {
          errorMessage = `${errorData.error || 'An internal error occurred.'}`;
        } else {
          errorMessage = `Error ${statusCode}: ${errorData.error || 'An error occurred.'}`;
        }

        console.error(`HTTP ${statusCode}:`, errorData);
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. Large files may take longer to process.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      addMessage(errorMessage, 'assistant');
    } finally {
      setIsLoading(false);
      if (inputType === 'text') {
        setInputText('');
      }
      setSelectedFile(null);
      setShowFileUpload(false);
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !selectedFile) || isLoading) return;
    await processInput(inputText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscription = async (transcript: string) => {
    console.log('🎤 Received voice transcript:', transcript);
    // Update the input text field instead of processing immediately
    setInputText(transcript);
    // Focus on the input field so user can edit if needed
    textareaRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{
        backgroundImage: "url('/background.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        minHeight: '100vh',
        width: '100vw',
        overflow: 'hidden'
      }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      {/* Main chat container */}
      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <div className="bg-white bg-opacity-100 border-b border-gray-200 px-3 py-2 sm:px-6 sm:py-4 rounded-t-xl shadow-lg backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-500 rounded-full">
              <Bot className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 font-serif italic">LEGALEASE </h1>
              <p className="text-sm text-gray-500">
                {currentPdfId && uploadedFileName && (
                  <span className="ml-2 flex items-center space-x-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      📝 {uploadedFileName} ready for questions
                    </span>
                    <button
                      onClick={() => {
                        setCurrentPdfId(null);
                        setUploadedFileName(null);
                        addMessage('🗑️ PDF session cleared. You can upload a new document or continue with general chat.', 'assistant');
                      }}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                      title="Clear current PDF"
                    >
                      Clear
                    </button>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12 bg-white bg-opacity-0 backdrop-blur-sm rounded-lg">
                <Bot className="mx-auto text-white mb-4" size={40} />
                <h2 className="text-lg sm:text-xl font-semibold text-white mb-2 inline">Welcome to </h2>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 inline font-sarif italic">LEGALEASE</h2>
                <p className="text-sm sm:text-base text-white max-w-md mx-auto">
                  Upload a PDF, then ask questions about it.<br />
                  You can have general conversations or use voice input!
                </p>
                <div className="mt-4 text-xs sm:text-sm text-white max-w-lg mx-auto">
                  <p className="mb-2"><strong>PDF Workflow:</strong></p>
                  <div className="flex justify-center">
                    <ol className="list-decimal list-inside space-y-1 text-left">
                      <li>Upload a PDF file (gets indexed automatically)</li>
                      <li>Ask questions about the uploaded document</li>
                      <li>Continue asking questions about the same PDF</li>
                      <li>Upload a new PDF anytime to switch documents</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex space-x-3 max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.sender === 'user' ? 'bg-primary-500' : 'bg-secondary-600'
                    }`}>
                    {message.sender === 'user' ? (
                      <User className="text-white" size={16} />
                    ) : (
                      <Bot className="text-white" size={16} />
                    )}
                  </div>

                  {/* Message Content */}
                  <div className={`px-4 py-3 rounded-lg animate-slide-up ${message.sender === 'user'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white bg-opacity-100 backdrop-blur-sm text-gray-900 border border-gray-200'
                    }`}>
                    <div className="space-y-1">
                      {message.type === 'file' && (
                        <div className="flex items-center space-x-2 text-sm opacity-80">
                          <Paperclip size={14} />
                          <span>File uploaded</span>
                        </div>
                      )}
                      {message.type === 'voice' && (
                        <div className="flex items-center space-x-2 text-sm opacity-80">
                          <span>🎤</span>
                          <span>Voice input</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p className={`text-xs mt-2 ${message.sender === 'user' ? 'text-primary-100' : 'text-gray-400'
                        }`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex space-x-3 max-w-3xl">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary-600 flex items-center justify-center">
                    <Bot className="text-white" size={16} />
                  </div>
                  <div className="px-4 py-3 bg-white rounded-lg border border-gray-200 animate-slide-up">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="animate-spin text-primary-500" size={16} />
                      <span className="text-gray-600">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* File Upload Section */}
        {showFileUpload && (
          <div className="border-t border-gray-200 bg-white bg-opacity-100 backdrop-blur-md px-6 py-4 shadow-lg">
            <div className="max-w-4xl mx-auto">
              <FileUpload
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {/* Input Area (Footer) */}
        <div className="w-full max-w-[1000px] bg-white/90 px-3 py-2 my-2 rounded-full flex items-center gap-2 shadow border border-gray-200 mx-auto mt-2">
          {/* Attach button & hidden file input */}
          <button
            onClick={() => {
              if (!isLoading && !isListening) {
                document.getElementById('chat-file-input')?.click();
              }
            }}
            className={`p-2 rounded-full ${selectedFile
              ? "text-primary-500"
              : "text-gray-600 hover:text-primary-500"
              } transition-colors`}
            title="Attach file"
            disabled={isLoading || isListening}
            type="button"
          >
            <Paperclip size={18} />
            <input
              id="chat-file-input"
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              disabled={isLoading || isListening}
              onChange={e => {
                const file = e.target.files?.[0] || null;
                setSelectedFile(file);
              }}
            />
          </button>

          {/* Show selected file inline */}
          {selectedFile && (
            <div className="flex items-center bg-blue-50 text-blue-700 px-2 py-1 rounded gap-1 text-xs font-medium">
              <span className="truncate max-w-[120px]">{selectedFile.name}</span>
              <button
                className="ml-1 text-red-400 hover:text-red-600"
                onClick={() => setSelectedFile(null)}
                type="button"
                title="Remove file"
                disabled={isLoading || isListening}
              >
                ×
              </button>
            </div>
          )}

          {/* Input field */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedFile ? "Add a question about your file..." : "Type your message..."}
            className="flex-1 bg-transparent text-black placeholder-gray-600 focus:outline-none resize-none text-sm px-2 py-1 rounded"
            style={{ minHeight: "32px", maxHeight: "50px" }}
            rows={1}
            disabled={isLoading || isListening}
          />

          {/* VoiceRecognition as mic */}
          <div className="flex-shrink-0 text-gray-600 hover:text-primary-500">
            <VoiceRecognition
              onTranscription={handleVoiceTranscription}
              isListening={isListening}
              setIsListening={setIsListening}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={(!inputText.trim() && !selectedFile) || isLoading || isListening}
            className="flex-shrink-0 bg-primary-500 text-white p-2 rounded-full disabled:bg-gray-600 disabled:text-gray-200 transition-colors hover:bg-primary-600"
            title="Send"
            type="button"
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
