import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import multer from 'multer';
import os from 'os';

// Config & Agent Imports
import { processUserMessage } from './agent/loop.js';
import { saveMessage, getConversationHistory, getSessionsList, renameSession, clearHistory, updateSession, saveToBoveda as saveBovedaFB, getBovedaFiles, readBovedaFile } from './memory/firebase.js';
import { generateCompletion, processAudio } from './agent/llm.js';
const app = express();

// Middlewares (Configurar antes de rutas)
app.use(cors());
app.use(express.json());

// --- ROUTES ---

// Health Check (Para Render)
app.get('/health', (req, res) => res.json({ status: 'ok', server: 'MyStrongAgent', uptime: process.uptime() }));

// TTS Endpoint (Microsoft Edge TTS — gratuito, sin API key)
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    console.log(`[TTS] Generando audio para: ${text.substring(0, 50)}...`);

    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('es-MX-JorgeNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);

    res.set('Content-Type', 'audio/mpeg');
    audioStream.pipe(res);

    audioStream.on('error', (err: any) => {
      console.error('[TTS] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Listar Sesiones
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getSessionsList();
    if (sessions.length === 0) {
      sessions.push({ id: 'default_web_session', title: 'Nueva Conversación', projectId: null, createdAt: new Date().toISOString() });
    }
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener Historial
app.get('/api/history', async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || 'default_web_session';
    const history = await getConversationHistory(sessionId, 100);
    res.json({ success: true, history, sessionId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Actualizar Sesión
app.post('/api/sessions/update', async (req, res) => {
  try {
    const { sessionId, title, projectId } = req.body;
    await updateSession(sessionId, { title, projectId });
    res.json({ success: true, message: 'Actualizada exitosamente' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Chat Texto
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default_web_session' } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Mensaje requerido.' });

    const allowedUserId = 6716935949; 
    const agentResponse = await processUserMessage(sessionId, allowedUserId, message);
    
    res.json({ success: true, response: agentResponse });
  } catch (error: any) {
    console.error("Error processing chat:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Multer Config
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    cb(null, `audio-${Date.now()}.webm`);
  }
});
const upload = multer({ storage });

// API: Chat Audio
app.post('/api/chat/audio', upload.single('audio'), async (req, res) => {
  try {
    const sessionId = req.body.sessionId || 'default_web_session';
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'No se subió archivo de audio.' });

    const allowedUserId = 6716935949;
    const textToProcess = await processAudio(file.path);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    if (!textToProcess || textToProcess.trim() === '') {
      return res.status(400).json({ success: false, error: 'No se pudo entender la grabación.' });
    }

    const agentResponse = await processUserMessage(sessionId, allowedUserId, textToProcess);
    res.json({ success: true, transcribedText: textToProcess, response: agentResponse });
  } catch(error: any) {
    console.error("Error audio chat:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Borrar Historial
app.delete('/api/history', async (req, res) => {
   try {
     const sessionId = (req.query.sessionId as string) || 'default_web_session';
     await clearHistory(sessionId);
     res.json({ success: true });
   } catch(error: any) {
     res.status(500).json({ success: false, error: error.message });
   }
});

// API: Guardar en Bóveda
app.post('/api/boveda/save', async (req, res) => {
  try {
    const { content, projectName } = req.body;
    if(!content || !projectName) return res.status(400).json({ success: false, error: 'Faltan campos' });

    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') + ".md";
    await saveBovedaFB(safeName, content);

    res.json({ success: true, message: `Guardado en Bóveda: ${safeName}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Listar Bóveda
app.get('/api/boveda/list', async (req, res) => {
  try {
    const files = await getBovedaFiles();
    res.json({ success: true, files: files });
  } catch(error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Leer Bóveda
app.get('/api/boveda/read/:filename', async (req, res) => {
  try {
    const content = await readBovedaFile(req.params.filename);
    if (content === null) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, content });
  } catch(error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Static Files (Frontend)
const distPath = path.join(process.cwd(), 'mystrongagent-web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send("Frontend no compilado."));
}

export function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n--------------------------------------------`);
    console.log(`🌐 MyStrongAgent SERVER STARTED`);
    console.log(`📍 URL LOCAL: http://localhost:${PORT}`);
    console.log(`📅 FECHA: ${new Date().toLocaleString()}`);
    console.log(`🤖 Node Version: ${process.version}`);
    console.log(`--------------------------------------------\n`);
  });
}
