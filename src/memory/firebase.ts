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

  // Inicializar Firebase App
  const app = initializeApp(firebaseConfig);
  dbInstance = getFirestore(app);
  
  return dbInstance;
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

export async function renameSession(sessionId: string, title: string) {
  try {
    const db = getDB();
    await setDoc(doc(db, 'sessions', sessionId), { title }, { merge: true });
  } catch (error) {
    console.error("Error renombrando sesion:", error);
  }
}

export async function getSessionsList() {
  try {
    const db = getDB();
    
    // Lista de Unique Session IDs a partir de messages
    const messagesCol = collection(db, 'messages');
    const snapshot = await getDocs(messagesCol);
    
    const sessionIds = new Set<string>();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.sessionId) sessionIds.add(data.sessionId);
    });
    
    // Obtener los títulos de la colección 'sessions'
    const sessionsCol = collection(db, 'sessions');
    const sessionsSnap = await getDocs(sessionsCol);
    const titlesMap = new Map<string, string>();
    sessionsSnap.docs.forEach(doc => {
      titlesMap.set(doc.id, doc.data().title);
    });

    const result = Array.from(sessionIds).map(id => ({
      id,
      title: titlesMap.get(id) || id
    }));

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
