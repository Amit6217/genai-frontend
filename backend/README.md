# ML Integration Backend API

This Node.js/Express backend API integrates with an ML API at `https://genai-vkeo.onrender.com/hackrx/run` to provide document analysis and question-answering functionality.

-----

## Features

  * **File Upload & Processing**: Handles document uploads and subsequent analysis.
  * **Multiple Questions Support**: Processes both single questions and arrays of questions.
  * **Direct ML API Integration**: Integrates directly with the specified ML API.
  * **CORS Enabled**: Properly configured for `localhost:3000`, ensuring smooth frontend integration.
  * **Error Handling & Logging**: Includes robust error handling and logging for debugging.
  * **Environment Configuration**: Uses environment variables for flexible setup.

-----

## Installation

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Set up environment variables**: Copy the `.env` file to `.env.local` and update the variables as needed.
3.  **Start the development server**:
    ```bash
    npm run dev
    ```

-----

## API Endpoints

### `POST /api/analyze-document`

This is the main endpoint for document analysis. It accepts a document file and questions, then forwards them to the ML API.

**Content-Type**: `multipart/form-data`

**Parameters**:

  * `file` (REQUIRED): The PDF or other document file to be analyzed.
  * `questions` (REQUIRED): A single question string or an array of questions.

**Example using `curl`**:

```bash
curl -X POST \
  -F "file=@policy.pdf" \
  -F "questions=What are the penalties?" \
  -F "questions=What is the coverage limit?" \
  http://localhost:5000/api/analyze-document
```

**Example Response**:

```json
{
  "success": true,
  "response": {
    "answers": [
      {
        "answer": "There are penalties mentioned in the text..."
      }
    ]
  },
  "questions": ["are there any penalties"],
  "file": {
    "originalName": "contract3.pdf",
    "mimetype": "application/pdf", 
    "size": 62525
  },
  "timestamp": "2025-09-19T09:13:00.594Z"
}
```

### Other Endpoints

  * `GET /api/health`: A health check endpoint to verify the server is running.
  * `POST /api/process-file-question` (Legacy): For backward compatibility, processes a file with a single question.
  * `GET /api`: Provides API documentation.

-----

## Troubleshooting

  * **CORS Errors**: Ensure the backend is configured to allow requests from `http://localhost:3000`. You might need to restart the backend after making changes to its configuration.
  * **File Upload Errors**: Confirm that the `Content-Type` is `multipart/form-data`. The maximum file size is 10MB.
  * **Connection Issues**: Check that the backend is running on port 5000. The ML API URL should also be correctly set in your environment variables.