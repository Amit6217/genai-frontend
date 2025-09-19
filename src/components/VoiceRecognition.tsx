import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { VoiceRecognitionProps } from '../types';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const VoiceRecognition: React.FC<VoiceRecognitionProps> = ({
  onTranscription,
  isListening,
  setIsListening,
}) => {
  const [recognition, setRecognition] = useState<any>(null);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              interimTranscript += result[0].transcript;
            }
          }

          const fullTranscript = finalTranscript || interimTranscript;
          setTranscript(fullTranscript);

          if (finalTranscript) {
            onTranscription(finalTranscript);
            setTranscript('');
          }
        };

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognitionInstance);
        setIsSupported(true);
      } else {
        setIsSupported(false);
        console.warn('Speech recognition not supported in this browser');
      }
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      setIsListening(false);
      recognition.stop();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center space-x-2 text-gray-500">
        <Volume2 size={20} />
        <span className="text-sm">Voice recognition not supported</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2">
      <button
        onClick={toggleListening}
        className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
            : 'bg-primary-500 hover:bg-primary-600 text-white'
        }`}
        title={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
        <span className="text-sm font-medium">
          {isListening ? 'Stop' : 'Voice'}
        </span>
      </button>

      {isListening && transcript && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 animate-fade-in">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Listening:</span> {transcript}
          </p>
        </div>
      )}

      {isListening && (
        <div className="flex items-center justify-center space-x-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecognition;
