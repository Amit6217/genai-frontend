const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// In-memory cache for storing indexed PDFs
const pdfCache = new Map();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add preflight handling for CORS
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }
  next();
});

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Content-Type:', req.headers['content-type']);
  next();
});

// Create uploads directory if it doesn't exist
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|txt|doc|docx|xls|xlsx|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // For text files, we need to also accept text/plain mimetype
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'text/plain';
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// API endpoints summary
app.get('/api', (req, res) => {
  res.json({
    name: 'ML Integration Backend API',
    version: '1.0.0',
    description: 'Backend API for integrating with ML services',
    endpoints: {
      'GET /api/health': 'Health check endpoint',
      'GET /api': 'This endpoint - API documentation',
      'POST /hackrx/upload': 'Upload PDF and create embeddings/index (returns pdf_id)',
      'POST /hackrx/query': 'Query PDF using pdf_id and question',
      'POST /api/chat': 'General chat/conversation endpoint (legacy)'
    },
    ml_api: {
      endpoint: process.env.ML_API_URL,
      description: 'Integrated ML API for document analysis'
    },
    usage: {
      'hackrx-upload': {
        method: 'POST',
        url: '/hackrx/upload',
        description: 'Upload PDF, create embeddings and BM25 index, store in cache',
        content_type: 'multipart/form-data',
        parameters: {
          file: 'PDF file to upload and index (REQUIRED)'
        },
        response: {
          pdf_id: 'Unique identifier for the uploaded PDF',
          message: 'Success message'
        },
        example: {
          curl: `curl -X POST -F "file=@policy.pdf" ${req.protocol}://${req.get('host')}/hackrx/upload`
        }
      },
      'hackrx-query': {
        method: 'POST',
        url: '/hackrx/query',
        description: 'Query uploaded PDF using pdf_id and natural language question',
        content_type: 'multipart/form-data',
        parameters: {
          pdf_id: 'PDF identifier from upload response (REQUIRED)',
          question: 'Natural language question (REQUIRED)'
        },
        response: {
          answer: {
            answer: 'Generated answer based on PDF content'
          }
        },
        example: {
          curl: `curl -X POST -F "pdf_id=policy123.pdf" -F "question=What is the waiting period for pre-existing diseases?" ${req.protocol}://${req.get('host')}/hackrx/query`
        }
      },
    }
  });
});

// HackRX Upload PDF endpoint - Upload PDF and create embeddings/BM25 index
app.post('/hackrx/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Validate that it's a PDF file
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    };

    console.log(`📤 Uploading PDF to ML API for indexing: ${req.file.originalname}`);
    
    // Call ML API to upload and index the PDF
    const mlResponse = await uploadPDFToMLAPI(fileInfo);
    
    // Extract pdf_id from ML API response
    const pdf_id = mlResponse.pdf_id;
    
    if (!pdf_id) {
      throw new Error('ML API did not return a pdf_id in response');
    }
    
    console.log(`✅ ML API returned pdf_id: ${pdf_id}`);
    
    // Check if this PDF is already indexed in cache (by pdf_id from ML API)
    if (pdfCache.has(pdf_id)) {
      console.log(`📋 PDF ${pdf_id} already indexed, updating cache`);
    }
    
    // Store the PDF info in cache with the ML API response
    pdfCache.set(pdf_id, {
      fileInfo: fileInfo,
      indexedAt: new Date().toISOString(),
      mlApiResponse: mlResponse,
      originalFilename: req.file.originalname
    });
    
    console.log(`✅ PDF ${pdf_id} successfully indexed and cached`);
    
    // Clean up uploaded file after successful processing
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.warn('Failed to cleanup uploaded file:', cleanupError.message);
    }
    
    // Return the exact format specified in requirements
    res.json({
      pdf_id: pdf_id,
      message: "✅ PDF uploaded & indexed"
    });
  } catch (error) {
    console.error('PDF upload error:', error.message);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to cleanup file after error:', cleanupError.message);
      }
    }
    
    res.status(500).json({ error: error.message });
  }
});

// HackRX Query endpoint - Query PDF using pdf_id and question
app.post('/hackrx/query', upload.none(), async (req, res) => {
  try {
    const { pdf_id, question } = req.body;
    
    // Validate required parameters
    if (!pdf_id) {
      return res.status(400).json({ error: 'pdf_id is required' });
    }
    
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }
    
    // Check if PDF exists in cache
    if (!pdfCache.has(pdf_id)) {
      return res.status(404).json({ 
        error: `PDF with id '${pdf_id}' not found. Please upload the PDF first using /hackrx/upload.` 
      });
    }
    
    console.log(`🔍 Querying PDF ${pdf_id} with question: "${question.trim()}"`);
    
    // Get cached PDF info
    const cachedPDF = pdfCache.get(pdf_id);
    
    // Call ML API to query the PDF
    const mlResponse = await queryPDFFromMLAPI(pdf_id, question.trim(), cachedPDF);
    
    console.log(`✅ Query completed for PDF ${pdf_id}`);
    
    // Return the exact format specified in requirements
    // Handle different possible response structures from ML API
    let answerText;
    if (mlResponse.answer && mlResponse.answer.answer) {
      // If ML API returns { answer: { answer: "text" } }
      answerText = mlResponse.answer.answer;
    } else if (mlResponse.answer) {
      // If ML API returns { answer: "text" }
      answerText = mlResponse.answer;
    } else if (mlResponse.response) {
      // If ML API returns { response: "text" }
      answerText = mlResponse.response;
    } else {
      // Fallback to the full response
      answerText = typeof mlResponse === 'string' ? mlResponse : JSON.stringify(mlResponse);
    }
    
    res.json({
      answer: {
        answer: answerText
      }
    });
  } catch (error) {
    console.error('PDF query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// Chat endpoint for general conversations
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversation_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('💬 General chat message:', message);
    
    // For general chat, provide a simple response without requiring ML API
    const responses = [
      `Thank you for your message: "${message}". This is a general chat response.`,
      `I received your message about "${message}". For document analysis, please upload a PDF file first.`,
      `Hello! You said: "${message}". I'm ready to help with document analysis if you upload a PDF.`,
      `I understand you're asking about "${message}". Upload a PDF document and I can provide detailed analysis.`
    ];
    
    const mlResponse = responses[Math.floor(Math.random() * responses.length)];

    res.json({
      success: true,
      response: mlResponse,
      conversation_id: conversation_id || generateConversationId(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// HackRX ML API integration functions

// Upload PDF to ML API for indexing (creates embeddings + BM25 index)
async function uploadPDFToMLAPI(fileInfo) {
  try {
    if (!fileInfo || !fileInfo.path) {
      throw new Error('File information is required for ML API upload');
    }
    
    const formData = new FormData();
    
    // Add PDF file
    const fileStream = fs.createReadStream(fileInfo.path);
    formData.append('file', fileStream, fileInfo.originalName);
    
    console.log(`📤 Uploading PDF to ML API: ${fileInfo.originalName}`);
    console.log('ML API URL:', process.env.ML_API_URL + '/hackrx/upload');
    
    const response = await axios.post(process.env.ML_API_URL + '/hackrx/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'application/json'
      },
      timeout: 120000 // 2 minute timeout for indexing
    });
    
    console.log('📥 ML API Upload Response Status:', response.status);
    console.log('📥 ML API Upload Response Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('ML API Upload Error:', error.response?.data || error.message);
    throw new Error(`ML API upload failed: ${error.response?.data?.error || error.message}`);
  }
}

// Query PDF from ML API using pdf_id and question
async function queryPDFFromMLAPI(pdf_id, question, cachedPDF) {
  try {
    if (!pdf_id || !question) {
      throw new Error('PDF ID and question are required for ML API query');
    }
    
    const formData = new FormData();
    
    // Add pdf_id and question as specified in the requirements
    formData.append('pdf_id', pdf_id);
    formData.append('question', question);
    
    console.log(`🔍 Querying ML API with pdf_id: ${pdf_id}`);
    console.log('Question:', question);
    console.log('ML API URL:', process.env.ML_API_URL + '/hackrx/query');
    
    const response = await axios.post(process.env.ML_API_URL + '/hackrx/query', formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'application/json'
      },
      timeout: 60000 // 1 minute timeout for queries
    });
    
    console.log('📥 ML API Query Response Status:', response.status);
    console.log('📥 ML API Query Response Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('ML API Query Error:', error.response?.data || error.message);
    throw new Error(`ML API query failed: ${error.response?.data?.error || error.message}`);
  }
}

// ML API integration function
async function callMLAPI(questions, fileInfo = null) {
  try {
    // Validate that both file and questions are provided (ML API requirement)
    if (!fileInfo || !fileInfo.path) {
      throw new Error('File is required for ML API call');
    }
    
    if (!questions || (Array.isArray(questions) && questions.length === 0)) {
      throw new Error('At least one question is required for ML API call');
    }
    
    const formData = new FormData();
    
    // Add file (required)
    const fileStream = fs.createReadStream(fileInfo.path);
    formData.append('file', fileStream, fileInfo.originalName);
    
    // Add questions (required - can be multiple)
    const validQuestions = [];
    if (Array.isArray(questions)) {
      questions.forEach(question => {
        if (question && question.trim()) {
          formData.append('questions', question.trim());
          validQuestions.push(question.trim());
        }
      });
    } else if (questions && questions.trim()) {
      formData.append('questions', questions.trim());
      validQuestions.push(questions.trim());
    }
    
    // Ensure we have at least one valid question
    if (validQuestions.length === 0) {
      throw new Error('No valid questions provided');
    }
    
    console.log(`📤 Calling ML API with file: ${fileInfo.originalName}, questions: ${validQuestions.length}`);
    console.log('Questions:', validQuestions);
    console.log('ML API URL:', process.env.ML_API_URL);
    
    const response = await axios.post(process.env.ML_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'application/json'
      },
      timeout: 60000 // 60 second timeout for large files
    });
    
    console.log('📥 ML API Response Status:', response.status);
    console.log('📥 ML API Response Data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('ML API Error:', error.response?.data || error.message);
    throw new Error(`ML API request failed: ${error.response?.data?.error || error.message}`);
  }
}

// Legacy support function for backward compatibility
async function simulateMLAPI(text, question, fileInfo = null) {
  // Convert to new format and call ML API
  const questions = [];
  if (question) questions.push(question);
  if (text && !question) questions.push(text);
  
  // ML API requires both file and questions
  if (!fileInfo) {
    throw new Error('File is required. Please upload a document to analyze.');
  }
  
  if (questions.length === 0) {
    throw new Error('At least one question is required for analysis.');
  }
  
  return await callMLAPI(questions, fileInfo);
}

// Generate conversation ID
function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
