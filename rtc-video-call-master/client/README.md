# TranslateConf - Real-time Translation Video Conferencing

A comprehensive video conferencing application with real-time translation capabilities, built with WebRTC for peer-to-peer communication.

## 🌟 Features

- **Real-time video & audio communication** - Connect with participants globally
- **Live translation capabilities** - Break language barriers during calls
- **Transcript panel** - View and save conversation history
- **Language selection** - Choose your preferred language
- **Room system** - Create and join private meeting rooms
- **Peer-to-peer architecture** - Direct connection for better privacy and performance
- **Simple controls** - Easily mute/unmute, enable/disable video, and manage your experience
- **Shareable links** - Invite others with a simple room link

## 🚀 Getting Started for Beginners

### Prerequisites

Before you begin, ensure you have:

- [Node.js](https://nodejs.org/) (v18 or newer)
- A modern web browser (Chrome, Firefox, Edge recommended)

### Installation Steps

1. **Install dependencies**:

   ```bash
   # Using npm
   npm install

   # OR using bun (faster)
   bun install
   ```

2. **Start the development server**:

   ```bash
   # Using npm
   npm run dev

   # OR using bun
   bun run dev
   ```

3. **Access the application**:
   Open your browser and navigate to [http://localhost:5173](http://localhost:5173)

### Connecting with Others

1. Create a new room or join an existing one
2. Share the room URL with participants
3. Grant camera and microphone permissions when prompted
4. Select your preferred language for translation
5. Start communicating!

## 🧰 Project Structure Explained

### Core Components

- `src/App.tsx` - Main application entry point and routing
- `src/pages/Home/join-room.tsx` - Room creation and joining interface
- `src/pages/Home/video-conference.tsx` - Video calling interface with controls
- `src/pages/Home/language-selector.tsx` - Language selection component
- `src/pages/Home/transcript-panel.tsx` - Real-time transcript and history

### Technical Components

- `src/hooks/useWebRTC.ts` - WebRTC connection management and media handling
- `src/config/socket.ts` - Socket.io configuration for signaling
- `src/config/constants.ts` - Application constants and configuration

## 🔄 How the Application Works

1. **Room Creation/Joining**:

   - User creates a new room or joins with a link
   - Room ID is generated or extracted from URL
   - Socket connection is established with the server

2. **Connection Establishment**:

   - WebRTC offers and answers are exchanged via Socket.io
   - ICE candidates are shared to establish the optimal connection path
   - Peer connection is established directly between participants

3. **Media Handling**:

   - Local audio/video streams are captured from user's device
   - Streams are shared with peers through WebRTC data channels
   - Controls allow toggling audio/video states

4. **Translation Features**:
   - Speech is captured and sent for processing
   - Translated text is displayed in the transcript panel
   - Users can view conversation in their preferred language

## 🛠️ Technologies Used

- **React** - UI framework
- **TypeScript** - Type-safe JavaScript
- **WebRTC** - Peer-to-peer media communication
- **Socket.io** - Signaling for WebRTC connection setup
- **Tailwind CSS** - Styling and responsive design

## 🌐 Setting Up the Server

This client application requires a server component for signaling. See the server documentation in the project root for setup instructions.

## ⚠️ Troubleshooting for Beginners

- **Camera/Microphone Issues**: Ensure you've granted the correct permissions in your browser
- **Connection Problems**: Check your internet connection and firewall settings
- **Room Joining Failures**: Verify the room ID is correct and the room exists
- **Video Quality Issues**: Try reducing background processes or connecting to a better network

## 🤝 Contributing

Contributions are welcome! See our contributing guidelines in the project root for more information.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
