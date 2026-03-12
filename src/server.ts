import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { processUserMessage } from './agent/loop.js';
import { getConversationHistory, clearHistory, getSessionsList } from './memory/firebase.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// API: Obtener la lista de Todas tus Conversaciones (Sesiones / Proyectos)
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getSessionsList();
    
    // Add default session if empty
    if (sessions.length === 0) {
      sessions.push({ id: 'default_web_session', title: 'Nueva Conversación', projectId: null, createdAt: new Date().toISOString() });
    }
    
    res.json({ success: true, sessions });
  } catch (error: any) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener el historial completo
app.get('/api/history', async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || 'default_web_session';
    const history = await getConversationHistory(sessionId, 100);
    res.json({ success: true, history, sessionId });
  } catch (error: any) {
    console.error("Error fetching history:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

import { generateCompletion } from './agent/llm.js';
import { renameSession, updateSession } from './memory/firebase.js';

// API: Actualizar meta de sesión (Renombrar, mover de proyecto)
app.post('/api/sessions/update', async (req, res) => {
  try {
    const { sessionId, title, projectId } = req.body;
    await updateSession(sessionId, { title, projectId });
    res.json({ success: true, message: 'Actualizada exitosamente' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Mandar un mensaje al agente
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default_web_session' } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Mensaje requerido.' });
    }

    const allowedUserId = 6716935949; 
    
    const agentResponse = await processUserMessage(sessionId, allowedUserId, message);
    
    // Generación de título automático (sólo en el primer mensaje)
    setTimeout(async () => {
      try {
        const history = await getConversationHistory(sessionId, 5);
        if (history.length <= 4) { // Significa que es una plática nueva
           const prompt = [
             { role: 'system' as const, content: 'Genera un TÍTULO CORTO de 2 a 4 palabras que resuma este mensaje. Responde SOLO con el título, sin usar comillas, sin formato markdown.'},
             { role: 'user' as const, content: message }
           ];
           const titleObj = await generateCompletion(prompt as any);
           if (titleObj && titleObj.content) {
              await renameSession(sessionId, titleObj.content);
           }
        }
      } catch (e) {
         console.error("Auto-rename failed:", e);
      }
    }, 100);

    res.json({ success: true, response: agentResponse });
  } catch (error: any) {
    console.error("Error processing chat:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

import multer from 'multer';
import os from 'os';
import { processAudio } from './agent/llm.js';

const upload = multer({ dest: os.tmpdir() });

// API: Mandar audio al agente
app.post('/api/chat/audio', upload.single('audio'), async (req, res) => {
  try {
    const sessionId = req.body.sessionId || 'default_web_session';
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se subió archivo de audio.' });
    }

    const allowedUserId = 6716935949;

    // Transcribir el archivo de audio usando whisper-large-v3 en Groq
    const textToProcess = await processAudio(file.path);
    
    // Eliminar el archivo temporal
    fs.unlinkSync(file.path);

    if (!textToProcess || textToProcess.trim() === '') {
      return res.status(400).json({ success: false, error: 'No se pudo entender la grabación.' });
    }

    // Procesar el texto transcrito
    const agentResponse = await processUserMessage(sessionId, allowedUserId, textToProcess);

    res.json({ success: true, transcribedText: textToProcess, response: agentResponse });
  } catch(error: any) {
    console.error("Error processing audio chat:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Quitado, reemplazado por /update más arriba

// API: Limpiar la bóveda de memoria de UNA sesión en específico
app.delete('/api/history', async (req, res) => {
   try {
     const sessionId = (req.query.sessionId as string) || 'default_web_session';
     await clearHistory(sessionId);
     res.json({ success: true, message: `Historial borrado para sesión: ${sessionId}.` });
   } catch(error: any) {
       res.status(500).json({ success: false, error: error.message });
   }
});

// API: Guardar directamente en la Bóveda en lugar de descargar
app.post('/api/boveda/save', async (req, res) => {
  try {
    const { content, projectName } = req.body;
    if(!content || !projectName) {
      return res.status(400).json({ success: false, error: 'Contenido y nombre del proyecto son requeridos.'});
    }

    const bovedaPath = path.join(process.cwd(), 'boveda_conocimiento');
    if (!fs.existsSync(bovedaPath)) {
      fs.mkdirSync(bovedaPath, { recursive: true });
    }

    // Sanitizar el nombre del archivo
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(bovedaPath, `${safeName}.md`);
    
    fs.writeFileSync(filePath, content, 'utf-8');

    res.json({ success: true, message: `Guardado exitosamente en Bóveda como: ${safeName}.md` });
  } catch (error: any) {
    console.error("Error saving to boveda:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Listar Bóveda de Conocimientos
app.get('/api/boveda/list', (req, res) => {
  try {
    const bovedaPath = path.join(process.cwd(), 'boveda_conocimiento');
    if (!fs.existsSync(bovedaPath)) {
      return res.json({ success: true, files: [] });
    }
    const files = fs.readdirSync(bovedaPath).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    
    const fileData = files.map(filename => {
       const stat = fs.statSync(path.join(bovedaPath, filename));
       return {
         name: filename,
         modified: stat.mtime
       };
    });
    
    // Sort logic
    fileData.sort((a,b) => b.modified.getTime() - a.modified.getTime());
    res.json({ success: true, files: fileData });
  } catch(error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Leer contenido de Bóveda
app.get('/api/boveda/read/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), 'boveda_conocimiento', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado.'});
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, content });
  } catch(error: any) {
     res.status(500).json({ success: false, error: error.message });
  }
});

// Server estático del frontend de React para la Nube
const distPath = path.join(process.cwd(), 'mystrongagent-web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Fallback Catch-all para SPA (Sin usar '*' que rompe express v5)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
} else {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.send("La UI de React no se ha compilado o no está en /dist. Si estás en Dev, por favor corre el servidor de Vite en el puerto 5173.");
    } else {
       next();
    }
  });
}

export function startServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 Servidor API (y UI estática si existe) iniciado en el puerto ${PORT}`);
  });
}
