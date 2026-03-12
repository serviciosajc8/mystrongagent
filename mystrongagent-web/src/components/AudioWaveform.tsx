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

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#ffffff',
      barWidth: 2,
      barRadius: 3,
      height: 40,
      normalize: true,
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      ws.play();
      setIsPlaying(true);
    });

    ws.on('audioprocess', () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

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
    if (waveSurferRef.current) {
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
    <div className="audio-player-container">
      <div className="audio-controls">
        <button className="player-btn" onClick={() => skip(-10)} title="Atrás 10s">⏪</button>
        <button className="player-btn play-main" onClick={togglePlay}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <button className="player-btn" onClick={() => skip(10)} title="Adelante 10s">⏩</button>
      </div>
      
      <div className="waveform-wrapper">
         <div ref={containerRef} className="waveform-draw" />
         <div className="time-display">
           <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
         </div>
      </div>

      <button className="player-close" onClick={onClose} title="Cerrar reproductor">×</button>
    </div>
  );
};

export default AudioWaveform;
