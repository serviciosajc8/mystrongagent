import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioWaveformProps {
  audioUrl: string;
  onClose: () => void;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ audioUrl, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Crear instancia de WaveSurfer
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#9D4EDD', // Morado
      progressColor: '#FF66A6', // Rosa
      cursorColor: '#ffffff',
      barWidth: 3,
      barGap: 3,
      barRadius: 4,
      height: 50,
      normalize: true,
      cursorWidth: 2,
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsReady(true);
      ws.play().catch(err => {
        console.warn("Auto-play blocked, wait for user interaction.", err);
      });
    });

    ws.on('audioprocess', () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      setIsPlaying(false);
      // Auto-cerrar si termina? No, mejor dejarlo para que lo cierren ellos
    });

    waveSurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (waveSurferRef.current) {
      waveSurferRef.current.playPause();
    }
  };

  const skip = (seconds: number) => {
    if (waveSurferRef.current && isReady) {
      const time = waveSurferRef.current.getCurrentTime();
      waveSurferRef.current.setTime(Math.max(0, Math.min(duration, time + seconds)));
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player-overlay">
      <div className="audio-player-glass">
        <div className="audio-controls">
          <button className="player-btn" onClick={() => skip(-10)} title="Retroceder 10s">⏪</button>
          <button className="player-btn play-main" onClick={togglePlay}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button className="player-btn" onClick={() => skip(10)} title="Adelantar 10s">⏩</button>
        </div>
        
        <div className="audio-waveform-container">
           <div ref={containerRef} className="waveform-canvas" />
           <div className="time-info">
             <span className="current-time">{formatTime(currentTime)}</span>
             <span className="duration">/ {formatTime(duration)}</span>
           </div>
        </div>

        <button className="player-exit" onClick={onClose} title="Cerrar">✕</button>
      </div>
    </div>
  );
};

export default AudioWaveform;
