# WebRTC Video Conference Server with Speech Services

This is the server component for a WebRTC video conferencing application with real-time speech-to-text and text-to-speech capabilities. It handles WebRTC signaling between clients and provides speech processing services using Google Cloud APIs.

## Key Features

- **WebRTC Signaling:** Manages peer-to-peer connections between users
- **Room Management:** Creates and manages video conferencing rooms
- **Speech-to-Text:** Real-time transcription of audio from participants
- **Text-to-Speech:** Converts text to speech for accessibility
- **Multi-language Support:** Supports multiple languages for speech services

## Technologies Used

- **Bun Runtime:** Fast JavaScript/TypeScript runtime
- **Express.js:** Web server framework
- **Socket.IO:** Real-time bidirectional communication
- **TypeScript:** Type-safe JavaScript
- **Google Cloud Speech-to-Text API:** For real-time transcription
- **Google Cloud Text-to-Speech API:** For speech synthesis

## Prerequisites

1. [Bun](https://bun.sh/) installed on your machine
2. Google Cloud account with Speech-to-Text and Text-to-Speech APIs enabled
3. Google Cloud service account credentials (JSON key file)

## Project Structure

```
server/
├── index.ts                 # Main server entry point
├── services/                # Service implementations
│   ├── speechToText.ts      # Google Speech-to-Text integration
│   └── textToSpeech.ts      # Google Text-to-Speech integration
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── .env                     # Environment variables
└── google-credentials.json  # Google Cloud service account credentials
```

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-name>/server
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Set Up Google Cloud Credentials

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Speech-to-Text and Text-to-Speech APIs
3. Create a service account and download the JSON key file
4. Place the JSON key file in the server directory as `google-credentials.json`

### 4. Configure Environment Variables

Create a `.env` file in the server directory with the following content:

```
GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json
PORT=3001
```

## Running the Server

### Development Mode (with Hot Reloading)

```bash
bun run dev
```

### Production Build

```bash
bun run build
bun run start
```

## API Documentation

### HTTP Endpoints

- `GET /api/check-room/:roomId` - Check if a room exists and is available to join

### Socket.IO Events

#### Room Management

- `create-room` - Create a new conference room
- `join-room` - Join an existing room
- `leave-room` - Leave the current room
- `user-joined` - Emitted when a user joins a room
- `user-left` - Emitted when a user leaves a room
- `room-full` - Emitted when a user tries to join a full room

#### WebRTC Signaling

- `offer` - Send a WebRTC offer to peers in the room
- `answer` - Send a WebRTC answer in response to an offer
- `ice-candidate` - Share ICE candidates for connection establishment

#### Speech Services

- `speech-to-text` - Send audio for real-time transcription
- `transcription` - Receive transcription results
- `text-to-speech` - Request text-to-speech conversion
- `text-to-speech-response` - Receive synthesized audio
- `text-to-speech-error` - Receive error from text-to-speech service

## Implementation Details

### Room Management

The server limits each room to a maximum of 2 users. When a user joins a room, the server:

1. Checks if the room exists and has capacity
2. Adds the user to the room
3. Notifies existing users about the new participant

### WebRTC Signaling

The server acts as a signaling channel for WebRTC by:

1. Relaying offers and answers between peers
2. Sharing ICE candidates for connection establishment
3. Managing connection state changes

### Speech-to-Text Implementation

The speech-to-text service:

1. Accepts audio chunks from clients
2. Sends them to Google Cloud Speech-to-Text API
3. Returns real-time transcriptions to all users in the room

### Text-to-Speech Implementation

The text-to-speech service:

1. Accepts text input and language preference
2. Converts text to speech using Google Cloud Text-to-Speech API
3. Returns the synthesized audio to the requesting user

## Deployment Considerations

### Security

- Use HTTPS in production
- Implement authentication for room access
- Secure your Google Cloud credentials
- Set up rate limiting to prevent abuse

### Scaling

- Consider using Redis adapter for Socket.IO in multi-server deployments
- Implement room capacity limits
- Monitor API usage for Google Cloud services

### STUN/TURN Servers

- For production, set up your own STUN/TURN servers or use a service
- Update the client's ICE server configuration accordingly

## Troubleshooting

### Common Issues

1. **Google API Authentication Errors**

   - Verify that your credentials file is correctly placed
   - Check that the APIs are enabled in your Google Cloud project
   - Ensure the service account has the correct permissions

2. **WebRTC Connection Issues**

   - Check network connectivity and firewall settings
   - Verify STUN/TURN server configuration
   - Check browser compatibility

3. **Speech Service Errors**
   - Verify audio format is compatible (WebM/Opus is recommended)
   - Check language code is supported by Google APIs
   - Monitor quota usage in Google Cloud Console

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
