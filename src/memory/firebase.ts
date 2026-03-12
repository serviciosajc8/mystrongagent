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
    
    // Quitamos el 'where' para evitar requerir Firestore Composite Index
    // Y lo filtramos localmente ya que es data ligera
    const q = query(
      messagesCol, 
      orderBy('timestamp', 'desc'), 
      limit(limitNum * 3) // Fetch more to account for filtering
    );
    const snapshot = await getDocs(q);
    
    let rows = snapshot.docs.map(doc => doc.data());
    
    // Filtrar localmente por ID de sesión
    rows = rows.filter(r => r.sessionId === sessionId);
    
    // Recortar al límite tras filtrar
    rows = rows.slice(0, limitNum);
    
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
    
    // Extraer timestamps del primer mensaje de la sesión
    const messagesCol = collection(db, 'messages');
    const snapshot = await getDocs(messagesCol);
    
    const sessionsMap = new Map<string, { id: string, timestamp: string }>();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.sessionId) {
        if (!sessionsMap.has(data.sessionId)) {
          sessionsMap.set(data.sessionId, { id: data.sessionId, timestamp: data.timestamp || '' });
        } else {
          const current = sessionsMap.get(data.sessionId)!;
          if (data.timestamp && data.timestamp < current.timestamp) {
             current.timestamp = data.timestamp;
          }
        }
      }
    });
    
    // Obtener los títulos y proyectos de la colección 'sessions'
    const sessionsCol = collection(db, 'sessions');
    const sessionsSnap = await getDocs(sessionsCol);
    const metaMap = new Map<string, any>();
    sessionsSnap.docs.forEach(doc => {
      metaMap.set(doc.id, doc.data());
    });

    let result = Array.from(sessionsMap.values()).map(sess => {
      const meta = metaMap.get(sess.id) || {};
      return {
        id: sess.id,
        title: meta.title || sess.id,
        projectId: meta.projectId || null,
        createdAt: meta.createdAt || sess.timestamp || new Date().toISOString()
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
