import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * 1. Multi-turn Chat Endpoint
 * Supported models:
 * - gemini-3.1-pro-preview (complex tasks)
 * - gemini-3.5-flash (general tasks)
 * - gemini-3.1-flash-lite (fast tasks)
 */
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { 
      messages = [], 
      systemInstruction = 'You are AI-CODER, an expert senior software engineer and code architect.',
      model = 'gemini-3.5-flash'
    } = req.body;

    if (!messages.length) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Validate supported models according to feature instruction
    const validModels = ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    const chosenModel = validModels.includes(model) ? model : 'gemini-3.5-flash';

    // Format history for multi-turn chat
    // Each item has role: 'user' | 'model', parts: [{ text }]
    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'agent' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text || '' }]
    }));

    const response = await ai.models.generateContent({
      model: chosenModel,
      contents: formattedContents,
      config: {
        systemInstruction,
      }
    });

    const replyText = response.text || '';

    return res.json({
      text: replyText,
      modelUsed: chosenModel,
      role: 'model'
    });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate chat response' 
    });
  }
});

/**
 * 2. Google Maps Grounding Endpoint
 * Model: gemini-3.5-flash with googleMaps tool
 */
app.post('/api/maps-grounding', async (req: Request, res: Response) => {
  try {
    const { prompt, lat, lng } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (lat && lng) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: Number(lat),
            longitude: Number(lng),
          }
        }
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config,
    });

    const replyText = response.text || '';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    // Extract places and URLs strictly according to Maps Grounding specification
    const mapPlaces: any[] = [];
    groundingChunks.forEach((chunk: any) => {
      if (chunk.maps) {
        mapPlaces.push({
          title: chunk.maps.title || 'Location',
          uri: chunk.maps.uri || '',
          reviewSnippets: chunk.maps.placeAnswerSources?.reviewSnippets || []
        });
      }
    });

    return res.json({
      text: replyText,
      places: mapPlaces,
      groundingChunks,
      modelUsed: 'gemini-3.5-flash'
    });
  } catch (error: any) {
    console.error('Error in /api/maps-grounding:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to process Google Maps grounding' 
    });
  }
});

/**
 * 3. Live API Voice WebSocket Server (gemini-3.8-live)
 * Allows real-time bidirectional voice conversations with the model
 */
const wss = new WebSocketServer({ server, path: '/api/live-ws' });

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Live Voice WebSocket');
  let liveSession: any = null;

  try {
    liveSession = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'You are AI-CODER Voice Partner, an expert coding collaborator speaking concisely in real-time.',
      },
      callbacks: {
        onmessage: (message: any) => {
          // Model output audio is 24kHz PCM base64
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'audio',
                    audio: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                  }));
                }
              }
              if (part.text) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'transcription',
                    text: part.text
                  }));
                }
              }
            }
          }

          if (message.serverContent?.interrupted) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
          }
        },
        onerror: (err: any) => {
          console.error('Gemini Live API error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Live API error' }));
          }
        },
        onclose: () => {
          console.log('Gemini Live session closed');
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'closed' }));
          }
        }
      }
    });

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'ready', model: 'gemini-3.8-live' }));
    }
  } catch (err: any) {
    console.error('Failed to connect to Gemini Live API:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ 
        type: 'error', 
        error: `Could not start gemini-3.8-live session: ${err.message}` 
      }));
    }
  }

  // Handle incoming audio from client mic (16kHz PCM base64)
  clientWs.on('message', (data: any) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'audio' && msg.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: msg.audio,
            mimeType: 'audio/pcm;rate=16000'
          }
        });
      } else if (msg.type === 'text' && msg.text && liveSession) {
        liveSession.sendRealtimeInput({
          text: msg.text
        });
      }
    } catch (e) {
      console.warn('Invalid message format from client WebSocket', e);
    }
  });

  clientWs.on('close', () => {
    console.log('Client closed WebSocket connection');
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {
        // ignore
      }
    }
  });
});

// Mount Vite or static dist
async function setupVite() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`AI-CODER Desktop Server running on http://0.0.0.0:${port}`);
  });
}

setupVite().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
