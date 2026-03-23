import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import './index.css';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  name?: string;
  timestamp?: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<{id: string, title: string, projectId: string | null, createdAt: string}[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1000);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [currentView, setCurrentView] = useState<'chat' | 'boveda'>('chat');
  const [bovedaFiles, setBovedaFiles] = useState<any[]>([]);
  const [bovedaPreview, setBovedaPreview] = useState<{name: string, content: string} | null>(null);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);

  const API_URL = import.meta.env.PROD 
    ? '/api' 
    : (window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : `http://${window.location.hostname}:3000/api`);

  useEffect(() => {
    fetchSessionsList();
    const handleResize = () => {
      if (window.innerWidth > 1000) setIsSidebarOpen(true);
      else setIsSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

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
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        setIsListening(false);

        if (audioBlob.size === 0) return;
        setLoading(true);
        const now = new Date().toISOString();

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'voice.webm');
          formData.append('sessionId', currentSessionId);

          const resp = await fetch(`${API_URL}/chat/audio`, {
            method: 'POST',
            body: formData,
          });
          
          const data = await resp.json();
          const resNow = new Date().toISOString();
          
          if (data.success && data.response && data.transcribedText) {
             setMessages(prev => [
               ...prev, 
               { role: 'user', content: `🎙️ ${data.transcribedText}`, timestamp: now },
               { role: 'assistant', content: data.response, timestamp: resNow }
             ]);
             if (voiceEnabled) speakText(data.response);
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
      alert("No se pudo acceder al micrófono.");
    }
  };

  const speakText = async (text: string) => {
    const textToSpeak = text.replace(/!\[.*?\]\(.*?\)/g, ' Imagen. ')
                            .replace(/`{3}[\s\S]*?`{3}/g, ' Bloque de código. ');

    try {
      const response = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak.substring(0, 1500) }) 
      });

      if (!response.ok) throw new Error("Error en TTS");

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      if (activeAudio) URL.revokeObjectURL(activeAudio);
      setActiveAudio(null);
      setTimeout(() => setActiveAudio(audioUrl), 10);
    } catch (e) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(textToSpeak);
      utter.lang = 'es-MX';
      window.speechSynthesis.speak(utter);
    }
  };

  const fetchSessionsList = async () => {
    try {
      const resp = await fetch(`${API_URL}/sessions`);
      const data = await resp.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
        if (data.sessions.length > 0) {
          if (!currentSessionId) setCurrentSessionId(data.sessions[0].id);
        } else {
          startNewSession();
        }
      }
    } catch (e) {
      console.error(e);
      if (!currentSessionId) startNewSession();
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
    setMessages([]);
    setCurrentView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
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
    } catch(err) { console.error(err); }
  };

  const handleSetProject = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newProject = window.prompt("Nombre del PROYECTO:");
    const finalProject = newProject?.trim() ? newProject.trim() : null;
    setSessions(prev => prev.map(s => s.id === sessId ? { ...s, projectId: finalProject } : s));
    try {
      await fetch(`${API_URL}/sessions/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessId, projectId: finalProject })
      });
    } catch(err) { console.error(err); }
  };

  const addManualProject = () => {
    const projName = window.prompt("Nombre del nuevo Proyecto:");
    if (!projName?.trim()) return;
    const dummySession = {
      id: uuidv4(),
      title: "Nueva conversación en " + projName,
      projectId: projName.trim(),
      createdAt: new Date().toISOString()
    };
    setSessions(prev => [dummySession, ...prev]);
    setCurrentSessionId(dummySession.id);
    setCurrentView('chat');
    setMessages([]);
    fetch(`${API_URL}/sessions/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: dummySession.id, title: dummySession.title, projectId: dummySession.projectId })
    });
  };

  const loadBoveda = async () => {
    setCurrentView('boveda');
    setBovedaPreview(null);
    try {
      const resp = await fetch(`${API_URL}/boveda/list`);
      const data = await resp.json();
      if (data.success) setBovedaFiles(data.files);
    } catch (e) { console.error(e); }
  };

  const openBovedaFile = async (filename: string) => {
    try {
      const resp = await fetch(`${API_URL}/boveda/read/${filename}`);
      const data = await resp.json();
      if (data.success) setBovedaPreview({ name: filename, content: data.content });
    } catch (e) { console.error(e); }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;
    if (isListening && mediaRecorderRef.current) mediaRecorderRef.current.stop();

    const userMessage = input.trim();
    const now = new Date().toISOString();
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: now }]);
    setLoading(true);

    try {
      const resp = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId: currentSessionId }),
      });
      const data = await resp.json();
      const resNow = new Date().toISOString();
      if (data.success && data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: resNow }]);
        if (voiceEnabled) speakText(data.response);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${data.error || 'Desconocido'}`, timestamp: resNow }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error de conexión: ${error.message}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const saveToBoveda = async (content: string) => {
    const projectName = window.prompt("Nombre para guardar en bóveda:");
    if (!projectName?.trim()) return;
    try {
      const res = await fetch(`${API_URL}/boveda/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, projectName: projectName.trim() })
      });
      const data = await res.json();
      alert(data.success ? data.message : "Error: " + data.error);
    } catch (error) { alert("Error de conexión."); }
  };

  const renderTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="app-container">
      {isSidebarOpen && window.innerWidth < 1000 && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon">✨</div>
          <h2>MyStrongAgent</h2>
        </div>
        
        <div className="nav-menu">
          <div className="nav-item action-btn" onClick={() => startNewSession()} style={{ cursor: 'pointer', color: 'var(--c-pink)', fontWeight: 'bold' }}>
            <span>➕</span> Nueva Conversación
          </div>
          
          <div className="search-container">
            <input 
              type="text" 
              className="search-input"
              placeholder="Buscar..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="nav-section-title">HISTORIAL</div>
          <button className="btn-add-project" onClick={addManualProject}>+ Proyecto</button>
          
          <div className="sessions-list" style={{ overflowY: 'auto', flex: 1 }}>
            {Array.from(new Set(sessions.map(s => s.projectId || 'Chats'))).sort().map(projName => {
               const projectSessions = sessions.filter(s => (s.projectId || 'Chats') === projName && (s.title.toLowerCase().includes(searchQuery.toLowerCase())));
               if (projectSessions.length === 0) return null;
               return (
                 <div key={projName} style={{ marginBottom: '10px' }}>
                   <div className="project-group-title">📁 {projName}</div>
                   {projectSessions.map(sess => (
                     <div 
                        key={sess.id} 
                        className={`session-item ${currentSessionId === sess.id ? 'active' : ''}`}
                        onClick={() => {
                          setCurrentSessionId(sess.id);
                          setCurrentView('chat');
                          if (window.innerWidth < 1000) setIsSidebarOpen(false);
                        }}
                     >
                        <div className="session-item-text"><span>💬</span> {sess.title}</div>
                        <div className="session-item-actions">
                           <button onClick={(e) => handleSetProject(sess.id, e)}>🏷️</button>
                           <button onClick={(e) => handleRenameSession(sess.id, e)}>✏️</button>
                        </div>
                      </div>
                   ))}
                 </div>
               );
            })}
          </div>

          <div className="nav-section-title">HERRAMIENTAS</div>
          <div className={`nav-item ${currentView === 'boveda' ? 'active' : ''}`} onClick={() => loadBoveda()}>
            <span>📁</span> Bóveda
          </div>
        </div>
        
        <div className="sidebar-footer">
          <button className={`voice-toggle-btn ${voiceEnabled ? 'active' : ''}`} onClick={() => setVoiceEnabled(!voiceEnabled)}>
            {voiceEnabled ? '🔊 Voz ON' : '🔇 Voz OFF'}
          </button>
          <div className="user-profile">
            <div className="avatar">👸</div>
            <div className="user-info">
              <span className="user-name">Jefa Pro</span>
              <span className="user-status">Conectada</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="chat-area">
        {currentView === 'chat' ? (
          <>
            <header className="chat-header">
              <button className="hamburger-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
              <h1>Asistente MyStrongAgent</h1>
            </header>
        
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-card">
                    <div className="empty-icon">🤖</div>
                    <h2>¡Hola, Jefa!</h2>
                    <p>Escribe o háblame...</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`message-wrapper ${msg.role}`}>
                    <div className="message-bubble-container">
                      <div className="message-bubble">
                        <ReactMarkdown>{(msg.content || '').replace(/<!--IMAGES:.*?-->/s, '').trim()}</ReactMarkdown>
                        <div className="message-time">{renderTime(msg.timestamp)}</div>
                      </div>
                      {msg.role === 'assistant' && msg.content && (
                        <div className="message-actions">
                          <button className="boveda-btn" onClick={() => speakText(msg.content || '')}>🔊</button>
                          <button className="boveda-btn" onClick={() => saveToBoveda(msg.content || '')}>📁</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="message-wrapper assistant">
                  <div className="message-bubble typing-indicator"><span></span><span></span><span></span></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              {isListening && <div className="recording-wave-overlay"><p>Grabando...</p></div>}
              <form onSubmit={sendMessage} className="input-form">
                <button type="button" className={`mic-btn ${isListening ? 'listening' : ''}`} onClick={toggleListen}>🎤</button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Escribe aquí..."
                />
                <button type="submit" disabled={!input.trim() || loading} className="send-btn">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="boveda-viewer">
            <header className="chat-header">
              <button className="hamburger-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
              <h1>📁 Tu Bóveda</h1>
              <div style={{flex:1}}></div>
              {bovedaPreview && <button onClick={() => setBovedaPreview(null)} className="save-btn">Volver</button>}
            </header>
            
            <div className="boveda-content">
              {!bovedaPreview ? (
                <div className="files-grid">
                   {bovedaFiles.map(f => (
                     <div key={f.name} className="file-card" onClick={() => openBovedaFile(f.name)}>
                       <span>📄</span>
                       <p>{f.name}</p>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="preview-container">
                   <h2>{bovedaPreview.name}</h2>
                   <ReactMarkdown>{bovedaPreview.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
