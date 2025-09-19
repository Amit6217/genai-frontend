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

  const addMessage = (content: string, sender: 'user' | 'assistant', type: 'text' | 'file' | 'voice' = 'text', fileInfo?: any) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      sender,
      timestamp: new Date(),
      type,
      fileInfo
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !selectedFile) || isLoading) return;

    const userMessage = inputText.trim() || (selectedFile ? `[File: ${selectedFile.name}]` : '');
    const messageType = selectedFile ? 'file' : 'text';
    
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
        if (inputText.trim()) {
          console.log(`🔍 Querying PDF ${pdf_id} with question: "${inputText.trim()}"`);
          const queryResult = await apiService.queryPDFFromHackRX(pdf_id, inputText.trim());
          addMessage(queryResult.answer.answer, 'assistant');
        }
      } else if (inputText.trim() && currentPdfId) {
        // Query existing PDF
        console.log(`🔍 Querying existing PDF ${currentPdfId} with question: "${inputText.trim()}"`);
        const queryResult = await apiService.queryPDFFromHackRX(currentPdfId, inputText.trim());
        addMessage(queryResult.answer.answer, 'assistant');
      } else if (inputText.trim()) {
        // Text only - general chat
        response = await apiService.sendMessage(inputText.trim(), conversationId || undefined);
        
        if (response.success) {
          const messageContent = extractMessageContent(response.response);
          addMessage(messageContent, 'assistant');
          
          if (response.conversation_id && !conversationId) {
            setConversationId(response.conversation_id);
          }
        } else {
          console.error('API returned unsuccessful response:', response);
          addMessage('Sorry, I encountered an error processing your request.', 'assistant');
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      let errorMessage = 'Sorry, I could not connect to the server. Please try again later.';
      
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
      setInputText('');
      setSelectedFile(null);
      setShowFileUpload(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscription = async (transcript: string) => {
    addMessage(transcript, 'user', 'voice');
    
    setIsLoading(true);
    try {
      const response = await apiService.processVoice(transcript);
      if (response.success) {
        const messageContent = extractMessageContent(response.response);
        addMessage(messageContent, 'assistant');
      } else {
        addMessage('Sorry, I encountered an error processing your voice input.', 'assistant');
      }
    } catch (error) {
      console.error('Error processing voice:', error);
      addMessage('Sorry, I could not process your voice input.', 'assistant');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-500 rounded-full">
            <Bot className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">AI Assistant</h1>
            <p className="text-sm text-gray-500">
              Powered by ML models - Upload files, ask questions, or use voice input
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
            <div className="text-center py-12">
              <Bot className="mx-auto text-gray-400 mb-4" size={48} />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome to AI Assistant</h2>
              <p className="text-gray-500 max-w-md mx-auto">
                Upload a PDF to get it indexed, then ask questions about it. 
                You can also have general conversations or use voice input!
              </p>
              <div className="mt-4 text-sm text-gray-400 max-w-lg mx-auto">
                <p className="mb-2"><strong>PDF Workflow:</strong></p>
                <ol className="text-left list-decimal list-inside space-y-1">
                  <li>Upload a PDF file (gets indexed automatically)</li>
                  <li>Ask questions about the uploaded document</li>
                  <li>Continue asking questions about the same PDF</li>
                  <li>Upload a new PDF anytime to switch documents</li>
                </ol>
              </div>
            </div>
          )}
          
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex space-x-3 max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.sender === 'user' ? 'bg-primary-500' : 'bg-secondary-600'
                }`}>
                  {message.sender === 'user' ? (
                    <User className="text-white" size={16} />
                  ) : (
                    <Bot className="text-white" size={16} />
                  )}
                </div>
                
                {/* Message Content */}
                <div className={`px-4 py-3 rounded-lg animate-slide-up ${
                  message.sender === 'user' 
                    ? 'bg-primary-500 text-white' 
                    : 'bg-white text-gray-900 border border-gray-200'
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
                    <p className={`text-xs mt-2 ${
                      message.sender === 'user' ? 'text-primary-100' : 'text-gray-400'
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
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <FileUpload 
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-4">
            {/* Voice Recognition */}
            <div className="flex-shrink-0">
              <VoiceRecognition 
                onTranscription={handleVoiceTranscription}
                isListening={isListening}
                setIsListening={setIsListening}
              />
            </div>
            
            {/* Text Input */}
            <div className="flex-1">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    selectedFile 
                      ? "Ask a question about your file..." 
                      : currentPdfId 
                        ? `Ask a question about ${uploadedFileName}...` 
                        : "Type your message here..."
                  }
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ minHeight: '48px' }}
                  disabled={isLoading || isListening}
                  rows={1}
                />
                
                {/* File attachment button */}
                <button
                  onClick={() => setShowFileUpload(!showFileUpload)}
                  className={`absolute bottom-3 right-12 p-1 rounded transition-colors ${
                    showFileUpload || selectedFile 
                      ? 'text-primary-500 hover:text-primary-600' 
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Attach file"
                  disabled={isLoading}
                >
                  <Paperclip size={20} />
                </button>
              </div>
              
              {/* File indicator */}
              {selectedFile && (
                <div className="mt-2 flex items-center space-x-2 text-sm text-gray-600">
                  <Paperclip size={14} />
                  <span>{selectedFile.name}</span>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-red-500 hover:text-red-600"
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            
            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={(!inputText.trim() && !selectedFile) || isLoading || isListening}
              className="flex-shrink-0 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors duration-200"
              title="Send message"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
