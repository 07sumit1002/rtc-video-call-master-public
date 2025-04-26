import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { google } from '@google-cloud/text-to-speech/build/protos/protos';
import fs from 'fs';

let textToSpeechClient: TextToSpeechClient | null = null;

/**
 * Initialize the Text-to-Speech client with Google credentials
 */
export function initTextToSpeechClient(credentialsPath: string): void {
  try {
    textToSpeechClient = new TextToSpeechClient({
      keyFilename: credentialsPath
    });
    console.log('Google Text-to-Speech client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Text-to-Speech client:', error);
    throw error;
  }
}

/**
 * Convert text to speech using Google Cloud Text-to-Speech API
 * @param text The text to convert to speech
 * @param languageCode The language code (e.g., 'en-US', 'fr-FR')
 * @returns Base64 encoded audio content
 */
export async function synthesizeSpeech(
  text: string, 
  languageCode: string = 'en-US'
): Promise<string> {
  if (!textToSpeechClient) {
    throw new Error('Text-to-Speech client not initialized');
  }

  if (!text || text.trim() === '') {
    throw new Error('No text provided for synthesis');
  }

  try {
    // Configure the request
    const request: google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      input: { text },
      voice: {
        languageCode
      },
      audioConfig: {
        audioEncoding: 'MP3',
      },
    };

    // Call the API
    const [response] = await textToSpeechClient.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content received from Text-to-Speech API');
    }

    // Convert audio content to Base64
    const audioBase64 = Buffer.from(response.audioContent as Uint8Array).toString('base64');
    return audioBase64;
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    throw error;
  }
} 