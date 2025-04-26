"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";
import { LanguageCodes } from "@/constants/Language";
import SocketManager from "@/config/socket";
import { Button } from "@/components/ui/button";
import { MdVolumeUp } from "react-icons/md";

interface Transcript {
  id: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  timestamp: Date;
  isUser?: boolean; // Whether message is from current user
}

interface TranscriptPanelProps {
  transcripts: Transcript[];
}

// This function can translate text from one language to another
// Simple implementation using Google Translate API
const translate = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
) => {
  if (text.trim() === "") return text;

  try {
    // Extract the language code from language name (assuming format like "en-US")
    const sourceLangCode = sourceLanguage.split("-")[0].toLowerCase();
    const targetLangCode = targetLanguage.split("-")[0].toLowerCase();

    // Skip if languages are the same
    if (sourceLangCode === targetLangCode) {
      return text;
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLangCode}&tl=${targetLangCode}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (error) {
    console.error("Translation error:", error);
    return text; // Return original text on error
  }
};

// Function to convert text to speech using socket
const speakText = (text: string, language: string) => {
  const socket = SocketManager.getSocket();
  if (!socket) {
    console.error("Socket not available for text-to-speech");
    return;
  }

  // Send text to server for conversion to speech
  console.log(
    `Requesting text-to-speech for: "${text}" in language: ${language}`
  );
  socket.emit("text-to-speech", {
    text,
    language,
  });
};

const TranscriptPanel = ({ transcripts }: TranscriptPanelProps) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [translatedMessages, setTranslatedMessages] = useState<
    Record<string, string>
  >({});
  const [loadingTranslations, setLoadingTranslations] = useState<
    Record<string, boolean>
  >({});
  const [translationErrors, setTranslationErrors] = useState<
    Record<string, boolean>
  >({});
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  // Get language name from code
  const getLanguageName = (code: string) => {
    return LanguageCodes[code] || code;
  };

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [transcripts, translatedMessages]);

  // Handle translation of non-user messages
  useEffect(() => {
    const handleTranslations = async () => {
      for (const transcript of transcripts) {
        // Only translate other user's messages (not our own) that haven't been translated yet
        if (
          !transcript.isUser &&
          !(transcript.id in translatedMessages) &&
          !(transcript.id in loadingTranslations)
        ) {
          // Get language codes
          const sourceLang = transcript.sourceLanguage;
          const targetLang = transcript.targetLanguage;

          // Skip translation if source and target languages are the same
          if (sourceLang === targetLang) {
            continue;
          }

          // Mark as loading
          setLoadingTranslations((prev) => ({
            ...prev,
            [transcript.id]: true,
          }));

          // Reset any previous error for this transcript
          setTranslationErrors((prev) => {
            const updated = { ...prev };
            delete updated[transcript.id];
            return updated;
          });

          try {
            // Translate using the correct source and target languages
            const translatedText = await translate(
              transcript.text,
              sourceLang,
              targetLang
            );

            // Store the translated text
            setTranslatedMessages((prev) => ({
              ...prev,
              [transcript.id]: translatedText,
            }));
          } catch (error) {
            console.error("Translation failed:", error);
            setTranslationErrors((prev) => ({
              ...prev,
              [transcript.id]: true,
            }));
          } finally {
            // Remove loading flag
            setLoadingTranslations((prev) => {
              const updated = { ...prev };
              delete updated[transcript.id];
              return updated;
            });
          }
        }
      }
    };

    handleTranslations();
  }, [transcripts]);

  // Set up audio response listener
  useEffect(() => {
    const socket = SocketManager.getSocket();
    if (!socket) return;

    // Listen for text-to-speech responses
    socket.on("text-to-speech-response", (data) => {
      console.log("Received text-to-speech audio");

      // Play the audio
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);

      audio.onplay = () => {
        setPlayingAudio(data.language);
      };

      audio.onended = () => {
        setPlayingAudio(null);
      };

      audio.onerror = (error) => {
        console.error("Error playing audio:", error);
        setPlayingAudio(null);
      };

      audio.play().catch((error) => {
        console.error("Error playing audio:", error);
        setPlayingAudio(null);
      });
    });

    // Listen for errors
    socket.on("text-to-speech-error", (error) => {
      console.error("Text-to-speech error:", error);
      setPlayingAudio(null);
    });

    return () => {
      socket.off("text-to-speech-response");
      socket.off("text-to-speech-error");
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Check if languages need translation
  const needsTranslation = (source: string, target: string) => {
    return (
      source.split("-")[0].toLowerCase() !== target.split("-")[0].toLowerCase()
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-teal-700">Transcript</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <ScrollArea className="h-[calc(100vh-220px)] p-4" ref={scrollAreaRef}>
          {transcripts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 italic">
              <p>No transcripts yet. Start speaking to see transcriptions.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transcripts.map((transcript) => (
                <div
                  key={transcript.id}
                  className={`flex flex-col ${
                    transcript.isUser ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500">
                      {formatTime(transcript.timestamp)}
                    </span>
                    {transcript.isUser ? (
                      <span className="text-xs font-medium text-teal-600">
                        {getLanguageName(transcript.sourceLanguage)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-blue-600">
                        {getLanguageName(transcript.sourceLanguage)} →{" "}
                        {getLanguageName(transcript.targetLanguage)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-lg shadow-sm max-w-[80%] ${
                      transcript.isUser
                        ? "bg-teal-600 text-white rounded-tr-none"
                        : "bg-white border border-gray-100 rounded-tl-none"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p>{transcript.text}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 -mr-1 -mt-1 ${
                          transcript.isUser
                            ? "text-white/80 hover:text-white/100 hover:bg-teal-700"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                        onClick={() =>
                          speakText(transcript.text, transcript.sourceLanguage)
                        }
                        disabled={playingAudio === transcript.sourceLanguage}
                      >
                        <MdVolumeUp
                          size={14}
                          className={
                            playingAudio === transcript.sourceLanguage
                              ? "animate-pulse"
                              : ""
                          }
                        />
                      </Button>
                    </div>

                    {/* Show translated message for non-user messages that need translation */}
                    {!transcript.isUser &&
                      needsTranslation(
                        transcript.sourceLanguage,
                        transcript.targetLanguage
                      ) && (
                        <>
                          {loadingTranslations[transcript.id] ? (
                            <div className="mt-2 border-t pt-2 border-gray-100">
                              <div className="flex items-center">
                                <div className="animate-pulse w-4 h-4 mr-2 rounded-full bg-gray-200"></div>
                                <p className="text-xs text-gray-400 italic">
                                  Translating to{" "}
                                  {getLanguageName(transcript.targetLanguage)}
                                  ...
                                </p>
                              </div>
                              <div className="mt-2 h-4 w-3/4 bg-gray-100 animate-pulse rounded"></div>
                              <div className="mt-1 h-4 w-1/2 bg-gray-100 animate-pulse rounded"></div>
                            </div>
                          ) : translationErrors[transcript.id] ? (
                            <div className="mt-2 border-t pt-2 border-gray-100">
                              <div className="flex items-center mb-1">
                                <div className="w-2 h-2 rounded-full bg-red-400 mr-2"></div>
                                <span className="text-xs text-red-500">
                                  Translation failed
                                </span>
                              </div>
                            </div>
                          ) : translatedMessages[transcript.id] ? (
                            <div className="mt-2 border-t pt-2 border-gray-100">
                              <div className="flex items-center mb-1">
                                <div className="w-2 h-2 rounded-full bg-blue-400 mr-2"></div>
                                <span className="text-xs text-gray-500">
                                  Translated to{" "}
                                  {getLanguageName(transcript.targetLanguage)}
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm">
                                  {translatedMessages[transcript.id]}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 -mr-1 -mt-1 text-gray-500 hover:text-gray-700"
                                  onClick={() =>
                                    speakText(
                                      translatedMessages[transcript.id],
                                      transcript.targetLanguage
                                    )
                                  }
                                  disabled={
                                    playingAudio === transcript.targetLanguage
                                  }
                                >
                                  <MdVolumeUp
                                    size={14}
                                    className={
                                      playingAudio === transcript.targetLanguage
                                        ? "animate-pulse"
                                        : ""
                                    }
                                  />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 border-t pt-2 border-gray-100">
                              <div className="flex items-center">
                                <div className="animate-pulse w-4 h-4 mr-2 rounded-full bg-gray-200"></div>
                                <p className="text-xs text-gray-400 italic">
                                  Waiting to translate...
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TranscriptPanel;
