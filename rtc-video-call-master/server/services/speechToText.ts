import { SpeechClient, protos } from '@google-cloud/speech';
import fs from 'fs';

// Initialize the Speech client with credentials
let speechClient: SpeechClient;

/**
 * Initialize the Google Speech-to-Text client with the provided API key
 * @param keyFilePath Path to the Google Cloud credentials JSON file
 */
export function initSpeechClient(keyFilePath: string): void {
  try {
    // Check if the credentials file exists
    if (!fs.existsSync(keyFilePath)) {
      throw new Error(`Google credentials file not found at: ${keyFilePath}`);
    }
    
    // Initialize the speech client with the API key
    speechClient = new SpeechClient({
      keyFilename: keyFilePath
    });
    
    console.log('Google Speech-to-Text client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Google Speech-to-Text client:', error);
    throw error;
  }
}

// Type for encoding options
type AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

/**
 * Convert audio buffer to text using Google Speech-to-Text API
 * @param audioBuffer The audio buffer to transcribe
 * @param config Optional configuration for the recognition
 * @returns Promise resolving to the transcription text
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  config: {
    encoding: keyof typeof protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
    sampleRateHertz: number;
    languageCode: string;
  }
): Promise<string> {
  if (!speechClient) {
    throw new Error('Speech client is not initialized. Call initSpeechClient first.');
  }
  
  try {
    // Set default configuration values if not provided
    const recognitionConfig = {
      encoding: (config.encoding || 'LINEAR16') as keyof typeof protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding,
      sampleRateHertz: config.sampleRateHertz || 16000,
      languageCode: config.languageCode || 'en-US',
    };
    
    // Prepare the request
    const request = {
      audio: {
        content: audioBuffer.toString('base64'),
      },
      config: recognitionConfig,
    };
    
    // Perform the transcription
    const [response] = await speechClient.recognize(request);
    
    console.log('Response:', response);
    // Extract results
    const transcription = response.results
      ?.map(result => result.alternatives?.[0]?.transcript)
      .filter(Boolean)
      .join('\n') || '';
      
    console.log(transcription)

    return transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}

/**
 * Convert audio file to text
 * @param filePath Path to the audio file
 * @param config Optional configuration for the recognition
 * @returns Promise resolving to the transcription text
 */
export async function transcribeFile(
  filePath: string,
  config: {
    encoding: keyof typeof protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
    sampleRateHertz: number;
    languageCode: string;
  }
): Promise<string> {
  try {
    // Read the file
    const audioBuffer = fs.readFileSync(filePath);
    
    // Transcribe the audio buffer
    return await transcribeAudio(audioBuffer, config);
  } catch (error) {
    console.error(`Error transcribing file ${filePath}:`, error);
    throw error;
  }
} 