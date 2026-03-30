import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, deleteDoc, doc, where, setDoc, getDoc } from "firebase/firestore";
import { env } from "../config/env.js";

let dbInstance: any = null;
let dbInitFailed = false;

export function initDB() {
  if (dbInstance) return dbInstance;
  if (dbInitFailed) return null;

  const requiredFields = [
    env.FIREBASE_API_KEY,
    env.FIREBASE_AUTH_DOMAIN,
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_APP_ID,
  ];

  const placeholder = "SUTITUYE POR EL TUYO";
  if (requiredFields.some(f => !f || f === placeholder)) {
    console.warn("⚠️ Credenciales de Firebase incompletas. La base de datos no funcionará.");
    dbInitFailed = true;
    return null;
  }

  try {
    const app = initializeApp({
      apiKey: env.FIREBASE_API_KEY,
      authDomain: env.FIREBASE_AUTH_DOMAIN,
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
      appId: env.FIREBASE_APP_ID,
    });
    dbInstance = getFirestore(app);
    console.log("✅ Firebase inicializado correctamente.");
    return dbInstance;
  } catch (error) {
    console.error("❌ Error inicializando Firebase:", error);
    dbInitFailed = true;
    return null;
  }
}

export function getDB() {
  return dbInstance ?? initDB();
}

export async function saveMessage(sessionId: string, msg: {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}) {
  try {
    const db = getDB();
    if (!db) {
      console.warn("[Firebase] No se puede guardar mensaje: DB no inicializada.");
      return;
    }
    const messagesCol = collection(db, 'messages');

    await addDoc(messagesCol, {
      sessionId,
      role: msg.role,
      content: msg.content || null,
      name: msg.name || null,
      tool_calls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      tool_call_id: msg.tool_call_id || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error al guardar mensaje en firebase:", error);
  }
}

export async function getConversationHistory(sessionId: string, limitNum: number = 100) {
  try {
    const db = getDB();
    if (!db) return [];
    const messagesCol = collection(db, 'messages');

    // Solo usamos where() sin orderBy para no requerir índice compuesto.
    // El ordenamiento se hace en memoria sobre los resultados filtrados.
    const q = query(messagesCol, where('sessionId', '==', sessionId));
    const snapshot = await getDocs(q);

    const rows = snapshot.docs
      .map(d => d.data())
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
      .slice(-limitNum);

    return rows.map(row => {
      const msg: any = { role: row.role };
      if (row.content) msg.content = row.content;
      if (row.name) msg.name = row.name;
      if (row.tool_calls) msg.tool_calls = (typeof row.tool_calls === 'string') ? JSON.parse(row.tool_calls) : row.tool_calls;
      if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
      if (row.timestamp) msg.timestamp = row.timestamp;
      return msg;
    });
  } catch (error) {
    console.error("Error al obtener historial de firebase:", error);
    return [];
  }
}

export async function updateSession(sessionId: string, data: any) {
  try {
    const db = getDB();
    if (!db) return;
    await setDoc(doc(db, 'sessions', sessionId), data, { merge: true });
  } catch (error) {
    console.error("Error actualizando sesion:", error);
  }
}

export async function renameSession(sessionId: string, title: string) {
  return updateSession(sessionId, { title });
}

export async function getSessionsList() {
  try {
    const db = getDB();
    if (!db) return [];

    const sessionsSnap = await getDocs(collection(db, 'sessions'));

    if (sessionsSnap.empty) {
      return [];
    }

    const result = sessionsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || d.id,
        projectId: data.projectId || null,
        createdAt: data.createdAt || new Date().toISOString()
      };
    });

    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return result;
  } catch (error) {
    console.error("Error obteniendo lista de sesiones:", error);
    return [];
  }
}

export async function clearHistory(sessionId: string) {
  try {
    const db = getDB();
    if (!db) return;
    const messagesCol = collection(db, 'messages');

    const q = query(messagesCol, where('sessionId', '==', sessionId));
    const snapshot = await getDocs(q);

    await Promise.all(snapshot.docs.map(d => deleteDoc(doc(db, 'messages', d.id))));
  } catch (error) {
    console.error("Error al limpiar historial de firebase:", error);
  }
}

// --- BOVEDA DE CONOCIMIENTO (PERSISTENTE) ---

export async function saveToBoveda(name: string, content: string) {
  try {
    const db = getDB();
    if (!db) return;
    await setDoc(doc(db, 'boveda', name), {
      name,
      content,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error al guardar en boveda firebase:", error);
  }
}

export async function getBovedaFiles() {
  try {
    const db = getDB();
    if (!db) return [];
    const snapshot = await getDocs(collection(db, 'boveda'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        name: data.name || d.id,
        modified: data.updatedAt || new Date().toISOString()
      };
    }).sort((a, b) => b.modified.localeCompare(a.modified));
  } catch (error) {
    console.error("Error al listar boveda firebase:", error);
    return [];
  }
}

export async function readBovedaFile(name: string) {
  try {
    const db = getDB();
    if (!db) return null;
    const docSnap = await getDoc(doc(db, 'boveda', name));
    return docSnap.exists() ? docSnap.data().content : null;
  } catch (error) {
    console.error("Error al leer boveda firebase:", error);
    return null;
  }
}

export async function getSessionMetadata(sessionId: string) {
  try {
    const db = getDB();
    if (!db) return null;
    const docSnap = await getDoc(doc(db, 'sessions', sessionId));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error("Error al obtener metadata de sesion firebase:", error);
    return null;
  }
}
