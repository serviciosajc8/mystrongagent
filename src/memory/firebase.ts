import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, where, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

let dbInstance: any = null;

export function initDB() {
  if (dbInstance) return dbInstance;

  try {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "SUTITUYE POR EL TUYO") {
        console.warn("⚠️ FIREBASE_API_KEY no configurada. La base de datos no funcionará.");
        return null;
    }
    // Inicializar Firebase App
    const app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app);
    return dbInstance;
  } catch (error) {
    console.error("❌ Error inicializando Firebase:", error);
    return null;
  }
}

export function getDB() {
  if (!dbInstance) {
    return initDB();
  }
  return dbInstance;
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
    const messagesCol = collection(db, 'messages');
    
    await addDoc(messagesCol, {
      sessionId: sessionId,
      role: msg.role,
      content: msg.content || null,
      name: msg.name || null,
      tool_calls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      tool_call_id: msg.tool_call_id || null,
      timestamp: new Date().toISOString()
    });
  } catch(error) {
    console.error("Error al guardar mensaje en firebase:", error);
  }
}

export async function getConversationHistory(sessionId: string, limitNum: number = 30) {
  try {
    const db = getDB();
    const messagesCol = collection(db, 'messages');
    
    // Usamos where para filtrar directamente por sessionId. 
    // Nota: Esto puede requerir un índice compuesto en Firebase si se usa con orderBy.
    // Si no hay índice, fallará al principio pero es la forma correcta.
    const q = query(
      messagesCol, 
      where('sessionId', '==', sessionId),
      orderBy('timestamp', 'desc'), 
      limit(limitNum)
    );
    const snapshot = await getDocs(q);
    const rows = snapshot.docs.map(doc => doc.data());
    
    return rows.reverse().map(row => {
      const msg: any = { role: row.role };
      if (row.content) msg.content = row.content;
      if (row.name) msg.name = row.name;
      if (row.tool_calls) msg.tool_calls = JSON.parse(row.tool_calls);
      if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
      if (row.timestamp) {
        msg.timestamp = row.timestamp;
      }
      return msg;
    });
  } catch(error) {
    console.error("Error al obtener historial de firebase:", error);
    return [];
  }
}

export async function updateSession(sessionId: string, data: { title?: string, projectId?: string, createdAt?: string }) {
  try {
    const db = getDB();
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

    // 1. Obtener todas las sesiones de la colección 'sessions' (fuente de verdad)
    const sessionsCol = collection(db, 'sessions');
    const sessionsSnap = await getDocs(sessionsCol);
    
    // 2. Si no hay sesiones en la colección, intentamos recuperar IDs de los mensajes (para compatibilidad)
    if (sessionsSnap.empty) {
      console.log("Colección 'sessions' vacía, buscando IDs en mensajes...");
      const messagesCol = collection(db, 'messages');
      const msgSnap = await getDocs(messagesCol);
      const tempMap = new Map();
      msgSnap.docs.forEach(d => {
        const data = d.data();
        if (data.sessionId && !tempMap.has(data.sessionId)) {
          tempMap.set(data.sessionId, { 
            id: data.sessionId, 
            title: data.sessionId, 
            createdAt: data.timestamp || new Date().toISOString() 
          });
        }
      });
      return Array.from(tempMap.values()).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    }

    // 3. Formatear resultados desde la colección de sesiones
    let result = sessionsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || doc.id,
        projectId: data.projectId || null,
        createdAt: data.createdAt || new Date().toISOString()
      };
    });
    
    // Ordenar de más reciente a más antiguo
    result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));

    return result;
  } catch (error) {
    console.error("Error obteniendo lista de sesiones:", error);
    return [];
  }
}

export async function clearHistory(sessionId: string) {
  try {
    const db = getDB();
    const messagesCol = collection(db, 'messages');
    
    // Filtrado local para borrar sin indexes
    const snapshot = await getDocs(messagesCol);
    const toDelete = snapshot.docs.filter(doc => doc.data().sessionId === sessionId);
    
    const deletePromises = toDelete.map(document => 
      deleteDoc(doc(db, 'messages', document.id))
    );
    
    await Promise.all(deletePromises);
  } catch(error) {
    console.error("Error al limpiar historial de firebase:", error);
  }
}

// --- BOVEDA DE CONOCIMIENTO (PERSISTENTE) ---

export async function saveToBoveda(name: string, content: string) {
  try {
    const db = getDB();
    if (!db) return;
    const bovedaCol = collection(db, 'boveda');
    // Usamos el nombre como ID para fácil acceso
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
    const bovedaCol = collection(db, 'boveda');
    const snapshot = await getDocs(bovedaCol);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.name || doc.id,
        modified: data.updatedAt || new Date().toISOString()
      };
    }).sort((a,b) => b.modified.localeCompare(a.modified));
  } catch (error) {
    console.error("Error al listar boveda firebase:", error);
    return [];
  }
}

export async function readBovedaFile(name: string) {
  try {
    const db = getDB();
    if (!db) return null;
    const docRef = doc(db, 'boveda', name);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().content;
    }
    return null;
  } catch (error) {
    console.error("Error al leer boveda firebase:", error);
    return null;
  }
}
