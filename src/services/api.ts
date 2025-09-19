import axios from 'axios';
import { ChatResponse, FileInfo, HackRXUploadResponse, HackRXQueryResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const apiService = {
  // Health check
  async healthCheck() {
    const response = await api.get('/api/health');
    return response.data;
  },

  // Upload file
  async uploadFile(file: File): Promise<{ success: boolean; file: FileInfo; message: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Process text message
  async sendMessage(message: string, conversationId?: string): Promise<ChatResponse> {
    const response = await api.post('/api/chat', {
      message,
      conversation_id: conversationId,
    });
    return response.data;
  },

  // Process text input
  async processText(text: string, question?: string): Promise<ChatResponse> {
    const response = await api.post('/api/process-text', {
      text,
      question,
    });
    return response.data;
  },

  // Process file with question
  async processFileWithQuestion(file: File, question: string): Promise<ChatResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('question', question);

    const response = await api.post('/api/process-file-question', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Process voice input
  async processVoice(audioText: string, question?: string): Promise<ChatResponse> {
    const response = await api.post('/api/process-voice', {
      audioText,
      question,
    });
    return response.data;
  },

  // HackRX: Upload PDF and get pdf_id
  async uploadPDFToHackRX(file: File): Promise<HackRXUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/hackrx/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 minute timeout for indexing
    });
    return response.data;
  },

  // HackRX: Query PDF using pdf_id and question
  async queryPDFFromHackRX(pdf_id: string, question: string): Promise<HackRXQueryResponse> {
    const formData = new FormData();
    formData.append('pdf_id', pdf_id);
    formData.append('question', question);

    const response = await api.post('/hackrx/query', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // 1 minute timeout for queries
    });
    return response.data;
  },

  // Analyze document with multiple questions (updated to use HackRX workflow)
  async analyzeDocument(file: File, questions: string | string[]): Promise<ChatResponse> {
    try {
      // Step 1: Upload PDF to HackRX and get pdf_id
      console.log('📤 Uploading PDF to HackRX API...');
      const uploadResult = await this.uploadPDFToHackRX(file);
      const pdf_id = uploadResult.pdf_id;
      
      console.log(`✅ PDF uploaded with ID: ${pdf_id}`);
      
      // Step 2: Query the PDF with each question
      const questionArray = Array.isArray(questions) ? questions : [questions];
      const answers = [];
      
      for (const question of questionArray) {
        if (question && question.trim()) {
          console.log(`🔍 Querying: "${question.trim()}"`);
          const queryResult = await this.queryPDFFromHackRX(pdf_id, question.trim());
          answers.push({ answer: queryResult.answer.answer });
        }
      }
      
      // Return in the expected ChatResponse format
      return {
        success: true,
        response: {
          answers: answers
        },
        timestamp: new Date().toISOString(),
        file: {
          originalName: file.name,
          mimetype: file.type,
          size: file.size
        },
        questions: questionArray.filter(q => q && q.trim())
      };
    } catch (error) {
      console.error('HackRX analyze document error:', error);
      throw error;
    }
  },

  // Legacy analyze document method (kept for backward compatibility)
  async analyzeDocumentLegacy(file: File, questions: string | string[]): Promise<ChatResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    // Handle both single question string and array of questions
    if (Array.isArray(questions)) {
      questions.forEach(question => {
        if (question && question.trim()) {
          formData.append('questions', question.trim());
        }
      });
    } else if (questions && questions.trim()) {
      formData.append('questions', questions.trim());
    }

    const response = await api.post('/api/analyze-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default apiService;
