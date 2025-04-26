# NexTalk - Real-time Translation Video Conferencing

NexTalk is a comprehensive video conferencing application with real-time translation capabilities, built with WebRTC for peer-to-peer communication.

## 🌟 Overview

- **Real-time video & audio communication** with participants globally
- **Live translation capabilities** breaking language barriers
- **Transcript panel** for viewing conversation history
- **WebRTC for peer-to-peer connections** ensuring better privacy and performance
- **Room management system** for creating and joining private meetings
- **Multi-language support** for speech services

## ⚙️ Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or [Node.js](https://nodejs.org/) (v18+)
- A modern web browser (Chrome, Firefox, Edge recommended)
- Google Cloud account with Speech-to-Text and Text-to-Speech APIs enabled (for server)

### Running the Application

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. **Set up the server**:

   ```bash
   cd server
   bun install
   ```

   - Configure `google-credentials.json` in the server directory
   - Create `.env` file in the server directory

3. **Set up the client**:

   ```bash
   cd ../client
   bun install
   ```

4. **Start both components**:

   **Important**: Always start the server first, then the client.

   Start the server:

   ```bash
   cd server
   bun run dev
   ```

   Then, in a new terminal, start the client:

   ```bash
   cd client
   bun run dev
   ```

   Both components use the same command `bun run dev` for development.

   Access the application at [http://localhost:5173](http://localhost:5173)

## 🧰 Project Structure

```
project/
├── client/             # React frontend application
│   ├── src/            # Source code
│   ├── package.json    # Client dependencies
│   └── README.md       # Detailed client documentation
│
├── server/             # Backend signaling server
│   ├── services/       # Speech services integration
│   ├── index.ts        # Server entry point
│   ├── package.json    # Server dependencies
│   └── README.md       # Detailed server documentation
│
└── README.md           # This file
```

## 📌 Additional Information

For detailed documentation about each component:

- See [client/README.md](./client/README.md) for frontend documentation
- See [server/README.md](./server/README.md) for backend documentation

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
