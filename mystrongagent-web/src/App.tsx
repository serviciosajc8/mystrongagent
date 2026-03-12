import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import './index.css';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  name?: string;
  timestamp?: string; // Nuevo
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Múltiples Sesiones y Proyectos
  const [sessions, setSessions] = useState<{id: string, title: string, projectId: string | null, createdAt: string}[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const synth = window.speechSynthesis;

  const [currentView, setCurrentView] = useState<'chat' | 'boveda'>('chat');
  const [bovedaFiles, setBovedaFiles] = useState<any[]>([]);
  const [bovedaPreview, setBovedaPreview] = useState<{name: string, content: string} | null>(null);

  const API_URL = import.meta.env.PROD 
    ? '/api' 
    : (window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : `http://${window.location.hostname}:3000/api`);

  // Boot up
  useEffect(() => {
    fetchSessionsList();
  }, []);

  // When session changes, load its history
  useEffect(() => {
    if (currentSessionId) {
      fetchHistory(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleListen = async () => {
    if (isListening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        
        // Apagar el stream para apagar la "lucecita" del mic en la pestaña
        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size === 0) return;

        setLoading(true);
        const now = new Date().toISOString();

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'voice.webm');
          formData.append('sessionId', currentSessionId);

          const resp = await fetch(`${API_URL}/chat/audio`, {
            method: 'POST',
            body: formData, // Se enviará automáticamente usando el content-type "multipart/form-data" apropiado
          });
          
          const data = await resp.json();
          const resNow = new Date().toISOString();
          
          if (data.success && data.response && data.transcribedText) {
             setMessages(prev => [...prev, { role: 'user', content: `🎙️ ${data.transcribedText}`, timestamp: now }]);
             setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: resNow }]);
             speakText(data.response);
          } else {
             setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Hubo un error al procesar tu audio: ${data.error || 'Desconocido'}`, timestamp: resNow }]);
          }
        } catch (error: any) {
          console.error("Error sending voice message:", error);
          setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error de conexión enviando el audio: ${error.message || 'Desconocido'}`, timestamp: new Date().toISOString() }]);
        } finally {
          setLoading(false);
          inputRef.current?.focus();
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      alert("No se pudo acceder al micrófono. Por favor concédele permisos a tu navegador.");
    }
  };

  const speakText = (text: string) => {
    if (!voiceEnabled) return;
    const textToSpeak = text.replace(/!\[.*?\]\(.*?\)/g, ' Aquí tienes la imagen solicitada. ');

    if (synth.speaking) {
      synth.cancel();
    }
    const utterThis = new SpeechSynthesisUtterance(textToSpeak);
    utterThis.lang = 'es-ES';
    
    // Attempt best spanish voice
    const voices = synth.getVoices();
    const optimalVoice = voices.find(v => v.lang.includes('es') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Sabina')));
    if (optimalVoice) utterThis.voice = optimalVoice;

    utterThis.rate = 1.05;
    utterThis.pitch = 1.0;
    synth.speak(utterThis);
  };

  const fetchSessionsList = async () => {
    try {
      const resp = await fetch(`${API_URL}/sessions`);
      const data = await resp.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
        if (data.sessions.length > 0) {
          setCurrentSessionId(data.sessions[0].id);
        } else {
          startNewSession();
        }
      }
    } catch (e) {
      console.error(e);
      startNewSession();
    }
  };

  const fetchHistory = async (session: string) => {
    try {
      const resp = await fetch(`${API_URL}/history?sessionId=${session}`);
      const data = await resp.json();
      if (data.success && data.history) {
        const chatMessages = data.history.filter((m: Message) => m.role === 'user' || (m.role === 'assistant' && m.content));
        setMessages(chatMessages);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const startNewSession = () => {
    const newId = uuidv4();
    setCurrentSessionId(newId);
    setSessions(prev => [{id: newId, title: 'Nueva Conversación', projectId: null, createdAt: new Date().toISOString()}, ...prev]);
    setMessages([]); // Hoja en blanco
    setCurrentView('chat');
    inputRef.current?.focus();
  };

  const handleRenameSession = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = window.prompt("Nuevo nombre para tu conversación:");
    if (!newName) return;
    
    setSessions(prev => prev.map(s => s.id === sessId ? { ...s, title: newName } : s));
    try {
      await fetch(`${API_URL}/sessions/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessId, title: newName })
      });
    } catch(err) {
      console.error(err);
    }
  };

  const handleSetProject = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newProject = window.prompt("Escribe el nombre del PROYECTO (Carpeta) para agruparlo o déjalo en blanco para sacarlo:");
    const finalProject = newProject?.trim() ? newProject.trim() : null;
    
    setSessions(prev => prev.map(s => s.id === sessId ? { ...s, projectId: finalProject } : s));
    try {
      await fetch(`${API_URL}/sessions/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessId, projectId: finalProject })
      });
    } catch(err) {
      console.error(err);
    }
  };

  const loadBoveda = async () => {
    setCurrentView('boveda');
    setBovedaPreview(null);
    try {
      const resp = await fetch(`${API_URL}/boveda/list`);
      const data = await resp.json();
      if (data.success) {
        setBovedaFiles(data.files);
      }
    } catch (e) {
       console.error(e);
    }
  };

  const openBovedaFile = async (filename: string) => {
    try {
      const resp = await fetch(`${API_URL}/boveda/read/${filename}`);
      const data = await resp.json();
      if (data.success) {
        setBovedaPreview({ name: filename, content: data.content });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    if (isListening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    const userMessage = input.trim();
    const now = new Date().toISOString();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: now }]);
    setLoading(true);

    try {
      const resp = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage, sessionId: currentSessionId }),
      });
      const data = await resp.json();
      
      const resNow = new Date().toISOString();
      if (data.success && data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: resNow }]);
        speakText(data.response);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Hubo un error al procesar tu mensaje: ${data.error || 'Desconocido'}`, timestamp: resNow }]);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error de conexión con el agente: ${error.message || 'Desconocido'}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  // Función para guardar COMO PROYECTO en la BÓVEDA
  const saveToBoveda = async (content: string) => {
    const projectName = window.prompt("¿Con qué nombre deseas guardar este proyecto/código en tu boveda_conocimiento?");
    if (!projectName?.trim()) return;

    try {
      const res = await fetch(`${API_URL}/boveda/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, projectName: projectName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert("Error al guardar: " + data.error);
      }
    } catch (error) {
      alert("Error de conexión al guardar en la bóveda.");
    }
  };

  const renderTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="app-container">
      {isSidebarOpen && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon">✨</div>
          <h2>MyStrongAgent</h2>
        </div>
        
        <div className="nav-menu">
          <div className="nav-item action-btn" onClick={startNewSession} style={{ cursor: 'pointer', color: 'var(--c-pink)', fontWeight: 'bold' }}>
            <span>➕</span> Nueva Conversación
          </div>
          
          <div className="nav-section-title" style={{ marginTop: '1rem' }}>BÚSQUEDA</div>
          <input 
            type="text" 
            placeholder="Buscar tema o fecha..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff', marginBottom: '1rem' }}
          />

          <div className="nav-section-title">HISTORIAL (Agrupado)</div>
          <div className="sessions-list" style={{ overflowY: 'auto', maxHeight: '250px' }}>
            {Array.from(new Set(sessions.map(s => s.projectId || 'Sin Proyecto'))).sort().map(projName => {
               const projectSessions = sessions.filter(s => (s.projectId || 'Sin Proyecto') === projName && (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || new Date(s.createdAt).toLocaleDateString().includes(searchQuery)));
               
               if (projectSessions.length === 0) return null;

               return (
                 <div key={projName} style={{ marginBottom: '10px' }}>
                   <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                     <span style={{ marginRight: '5px' }}>📁</span> {projName}
                   </div>
                   {projectSessions.map(sess => (
                     <div 
                        key={sess.id} 
                        className={`nav-item ${sess.id === currentSessionId && currentView === 'chat' ? 'active' : ''}`}
                        onClick={() => { setCurrentSessionId(sess.id); setCurrentView('chat'); }}
                        style={{ fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={`${sess.title} (${new Date(sess.createdAt).toLocaleDateString()})`}>
                          <span>💬</span> {sess.title}
                        </div>
                        <div>
                          <button onClick={(e) => handleSetProject(sess.id, e)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '10px' }} title="Mover a Proyecto">🏷️</button>
                          <button onClick={(e) => handleRenameSession(sess.id, e)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', marginLeft: '2px', fontSize: '10px' }} title="Renombrar">✏️</button>
                        </div>
                      </div>
                   ))}
                 </div>
               );
            })}
          </div>

          <div className="nav-section-title">PROYECTOS Y DOCUMENTOS</div>
          <div 
             className={`nav-item ${currentView === 'boveda' ? 'active' : ''}`}
             onClick={() => loadBoveda()}
             style={{ cursor: 'pointer' }}
          >
            <span>📁</span> Bóveda de Conocimiento
          </div>
        </div>
        
        <div className="sidebar-footer">
          <button 
             className={`voice-toggle-btn ${voiceEnabled ? 'active' : ''}`}
             onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if(synth.speaking) synth.cancel();
             }}
          >
            {voiceEnabled ? '🔊 Bot Hablando' : '🔇 Bot Silenciado'}
          </button>
          
          <div className="user-profile" style={{ marginTop: '12px' }}>
            <div className="avatar">👸</div>
            <div className="user-info">
              <span className="user-name">Jefa Pro</span>
              <span className="user-status">Conectada</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="chat-area" onClick={() => { if(isSidebarOpen) setIsSidebarOpen(false) }}>
        {currentView === 'chat' ? (
          <>
            <header className="chat-header">
              <button 
                 className="hamburger-btn" 
                 onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }}
              >
                ☰
              </button>
              <h1>Tu Asistente Personal (Voice & Vision)</h1>
            </header>
        
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🤖</div>
              <h2>¡Hola, Jefa! Soy tu IA Multimodal.</h2>
              <p>Escribe, háblame por voz o pídeme que dibuje algo.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper ${msg.role}`}>
                <div className="message-bubble-container">
                  <div className="message-bubble">
                    <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
                    <div className="message-time">
                      {renderTime(msg.timestamp)}
                    </div>
                  </div>
                  {msg.role === 'assistant' && msg.content && !msg.content.includes("Hubo un error") && (
                    <div className="message-actions">
                      <button 
                        className="save-btn" 
                        onClick={() => saveToBoveda(msg.content!)}
                        title="Guardar como proyecto en tu Bóveda local"
                      >
                        📁 Guardar en Bóveda
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="message-wrapper assistant">
               <div className="message-bubble-container">
                <div className="message-bubble typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form onSubmit={sendMessage} className="input-form">
            <button 
              type="button" 
              className={`mic-btn ${isListening ? 'listening' : ''}`} 
              onClick={toggleListen}
              title="Dictar por voz (Presiona y háblame)"
            >
              🎤
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Grabando... (Vuelve a tocar el micrófono rojo al terminar para enviar) 🛑" : "Sigue escribiendo aunque yo esté pensando..."}
              autoFocus
            />
            <button type="submit" disabled={!input.trim() || loading} className="send-btn">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
              </svg>
            </button>
          </form>
          <div className="disclaimer">Sesión: {currentSessionId ? currentSessionId.substring(0,8) + '...' : ''} | Imágenes y memoria Ilimitada</div>
        </div>
        </>) : (
          <div className="boveda-viewer" style={{ padding: '40px', overflowY: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '30px', gap: '15px' }}>
              <button 
                 className="hamburger-btn" 
                 onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }}
              >
                ☰
              </button>
              <h1 style={{fontSize: '1.8rem', color: '#fff', margin: 0 }}>📁 Tu Bóveda de Conocimiento</h1>
              <div style={{ flex: 1}}></div>
              {bovedaPreview && <button onClick={() => setBovedaPreview(null)} className="save-btn">Volver a Bóveda</button>}
            </div>
            
            {!bovedaPreview ? (
              <div className="files-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                 {bovedaFiles.length === 0 ? <p>Tu Bóveda está vacía.</p> : (
                   bovedaFiles.map(f => (
                     <div 
                         key={f.name} 
                         onClick={() => openBovedaFile(f.name)}
                         style={{ background: 'var(--bg-panel)', border: '1px solid var(--bg-panel-border)', borderRadius: '12px', padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'transform 0.2s', gap: '10px' }}
                         onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                         onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                     >
                       <span style={{ fontSize: '3rem' }}>📄</span>
                       <span style={{ textAlign: 'center', wordBreak: 'break-word', fontWeight: 600 }}>{f.name}</span>
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)'}}>{new Date(f.modified).toLocaleDateString()}</span>
                     </div>
                   ))
                 )}
              </div>
            ) : (
              <div className="preview-container" style={{ background: 'var(--bg-panel)', padding: '30px', borderRadius: '16px', border: '1px solid var(--bg-panel-border)' }}>
                 <h2 style={{borderBottom: '1px solid var(--bg-panel-border)', paddingBottom: '16px', marginBottom: '20px' }}>{bovedaPreview.name}</h2>
                 <div className="markdown-preview" style={{ lineHeight: '1.8' }}>
                    <ReactMarkdown>{bovedaPreview.content}</ReactMarkdown>
                 </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
