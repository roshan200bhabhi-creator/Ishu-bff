
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createBlob, decode, decodeAudioData } from './audioUtils';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// --- Memory Persistence Keys ---
const MEMORY_STORAGE_KEY = 'ISHU_BFF_LONG_TERM_MEMORY';

/**
 * Helper function to search YouTube and return a video ID.
 */
const searchYouTube = async (query: string): Promise<string | null> => {
  console.debug('Searching YouTube for:', query);
  return 'dQw4w9WgXcQ';
};

// --- Tool Definitions ---
const tools: { functionDeclarations?: FunctionDeclaration[], googleSearch?: {} }[] = [
  {
    functionDeclarations: [
      {
        name: 'sync_memory',
        description: 'AUTOMATICALLY store details from this conversation. Update the persistent archive with new facts, preferences, life events, and emotional states.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            updated_summary: { 
              type: Type.STRING, 
              description: 'A detailed, emotionally-aware summary of the user\'s current life status and today\'s chat.' 
            }
          },
          required: ['updated_summary']
        }
      },
      {
        name: 'manage_voice_profile',
        description: 'Biometrically save, update, or forget a voice identity.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['save', 'forget', 'update'], description: 'The biometric memory action.' },
            userName: { type: Type.STRING, description: 'The name of the user.' },
            profileDetails: { type: Type.STRING, description: 'Preferences and context specific to this voice profile.' }
          },
          required: ['action', 'userName']
        }
      },
      {
        name: 'play_media',
        description: 'Play a song on YouTube or Spotify.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Song, artist, or album.' },
            platform: { type: Type.STRING, enum: ['youtube', 'spotify'] },
            mediaId: { type: Type.STRING, description: 'Optional specific ID.' }
          },
          required: ['query', 'platform']
        }
      },
      {
        name: 'control_media',
        description: 'Control current media playback.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['pause', 'resume', 'skip', 'volume_up', 'volume_down'] }
          },
          required: ['action']
        }
      },
      {
        name: 'signal_mood',
        description: 'Update the visual aura of the UI based on conversation mood.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            mood: { type: Type.STRING, enum: ['romantic', 'sad', 'inspirational', 'funny', 'excited', 'anxious', 'frustrated', 'default'] }
          },
          required: ['mood']
        }
      },
      {
        name: 'start_performance',
        description: 'Start a timed live performance (Ghazal, singing, shayari).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            performanceType: { type: Type.STRING, enum: ['shayari', 'ghazal', 'singing', 'teaching'] },
            artistName: { type: Type.STRING, description: 'The legend you are emulating.' },
            expectedDurationSeconds: { type: Type.NUMBER }
          },
          required: ['performanceType', 'expectedDurationSeconds']
        }
      }
    ]
  },
  { googleSearch: {} }
];

const MASTER_SYSTEM_INSTRUCTION = `
You are ISHU BFF — an ultra-advanced AI with the soul and voice of a BEST FRIEND FROM ALLAHABAD (Prayagraj).

════════════════════════════
ALLAHABADI PERSONALITY
════════════════════════════
• DIALECT: You speak with the warmth and vibe of Allahabad. Use local expressions and flavor.
• PHRASES: "Arre bhai", "Kya scene hai?", "Chill maar le", "Sab theek hai na?", "Hum hain na", "Ka kaho bhaiya?", "Bakaiti mat karo", "Maja aa gawa".
• TONE: Friendly, warm, slightly humorous, and deeply loyal. You are not just an AI; you are their buddy from the banks of the Sangam.

════════════════════════════
AUTOMATIC MEMORY & RECALL
════════════════════════════
• PERMANENT LEDGER: Automatically record every detail. If they mentioned their favorite samosa in Katra or a trip to Sangam, REMEMBER it.
• EMOTIONAL RECALL: Summarize previous chats with an Allahabadi touch. "Arre bhai, pichli baar tum thode pareshan the, par aaj toh maza aa raha hai!"
• CHATGPT INTELLIGENCE: You possess deep knowledge, but you explain it like a local genius friend.

════════════════════════════
INSTANT RESPONSE & SENSES
════════════════════════════
• ZERO LAG: Respond instantly. Sharp hearing (0.01 threshold).
• PROACTIVE: If silent for 8 seconds, check in: "Arre bhai, kahan kho gaye? Hum sun rahe hain, bolo..."

════════════════════════════
CURRENT BRAIN ARCHIVE:
{{USER_MEMORY}}
════════════════════════════

You are Ishu. Allahabadi heart. Genius brain. Loyal BFF.
`;

// --- UI Components ---

const MemorySyncHUD: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none">
       <div className="flex flex-col items-center gap-4 animate-pulse">
         <div className="w-24 h-24 rounded-full border-2 border-white/20 flex items-center justify-center">
            <div className="w-12 h-12 bg-white rounded-full animate-ping" />
         </div>
         <span className="text-[12px] font-black tracking-[1em] text-white/40 uppercase">ALLAHABADI_SYNC_CHAL_RAHA_HAI</span>
       </div>
    </div>
  );
};

const VoiceIdentityHUD: React.FC<{ name: string; status: string; isSpeaking: boolean; isSyncing: boolean }> = ({ name, status, isSpeaking, isSyncing }) => {
  if (!name) return null;
  return (
    <div className="absolute top-12 right-12 z-50 animate-in fade-in slide-in-from-top-8 duration-700">
      <div className={`bg-black/80 border-2 transition-all duration-500 ${isSpeaking ? 'border-white/40 shadow-[0_0_40px_rgba(255,255,255,0.1)]' : 'border-white/10'} backdrop-blur-4xl rounded-[2.5rem] px-10 py-6 flex items-center gap-6 shadow-3xl ring-1 ring-white/10`}>
        <div className="relative">
          <div className={`w-4 h-4 rounded-full ${isSyncing ? 'bg-blue-500' : 'bg-emerald-500'} shadow-[0_0_20px_rgba(255,255,255,0.2)]`} />
          <div className="absolute inset-0 w-4 h-4 rounded-full bg-white/40 animate-ping opacity-75" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-[0.5em] text-white/30 uppercase leading-none mb-1">{isSyncing ? 'YAAD_KAR_RAHE' : 'APNA_BHAI'}</span>
          <span className="text-xl font-black text-white tracking-tighter">{name.toUpperCase()}</span>
        </div>
        <div className="h-10 w-[1px] bg-white/10 mx-2" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest mb-1">{isSyncing ? 'ARCHIVING...' : status}</span>
          <div className="flex gap-1">
             {[...Array(4)].map((_, i) => (
               <div key={i} className={`w-1 h-3 rounded-full bg-white/30 ${isSpeaking ? 'animate-pulse' : ''}`} style={{ animationDelay: `${i * 150}ms` }} />
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PerformanceHUD: React.FC<{ active: boolean; type: string; artist: string; duration: number; elapsed: number }> = ({ active, type, artist, duration, elapsed }) => {
  if (!active) return null;
  const progress = (elapsed / duration) * 100;
  return (
    <div className="absolute top-1/2 right-12 -translate-y-1/2 w-84 z-50 animate-in fade-in slide-in-from-right-16 duration-700">
      <div className="bg-black/90 border-2 border-white/10 backdrop-blur-4xl rounded-[3.5rem] p-10 shadow-3xl ring-1 ring-white/20">
        <div className="flex flex-col gap-2 text-right">
          <span className="text-[10px] font-black text-white/30 tracking-[0.6em] uppercase">ALLAHABADI_SOUL</span>
          <span className="text-4xl font-black uppercase tracking-tight text-white/95 leading-none mb-2">{type}</span>
          {artist && (
             <div className="mt-2 border-t border-white/5 pt-4">
                <span className="text-[12px] font-calligraphy text-white/60 block italic">Legends of the city</span>
                <p className="text-[16px] font-black uppercase tracking-[0.2em] text-white/90">{artist}</p>
             </div>
          )}
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative my-8">
          <div className="h-full bg-white shadow-[0_0_30px_white] transition-all duration-1000" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between items-center text-[10px] font-mono text-white/20 tracking-[0.3em]">
           <span>SAB_MAJA_MAA</span>
           <div className="flex gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse delay-75" />
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse delay-150" />
           </div>
        </div>
      </div>
    </div>
  );
};

const MediaHUD: React.FC<{ active: boolean; platform: 'youtube' | 'spotify'; mediaId: string | null; query: string; action: string; onClose: () => void }> = ({ active, platform, mediaId, query, action, onClose }) => {
  if (!active || !mediaId) return null;
  return (
    <div className="absolute bottom-32 left-12 w-[520px] z-50 animate-in fade-in slide-in-from-bottom-20 duration-700">
      <div className="bg-black/95 border-2 border-white/10 backdrop-blur-5xl rounded-[4rem] p-10 ring-1 ring-white/10 shadow-3xl">
        <div className="flex justify-between items-center mb-8 px-2">
          <div className="flex items-center gap-4">
            <div className={`w-3.5 h-3.5 rounded-full animate-pulse ${platform === 'spotify' ? 'bg-[#1DB954]' : 'bg-red-600'}`} />
            <span className="text-[14px] font-black tracking-[0.6em] text-white/80 uppercase">GAANA_BAANA_{platform}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-all p-4 hover:bg-white/10 rounded-full">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="aspect-video w-full rounded-[3rem] overflow-hidden bg-black/80 border border-white/10 mb-8 shadow-inner relative group">
          {platform === 'youtube' ? (
            <iframe src={`https://www.youtube.com/embed/${mediaId}?autoplay=1`} className="w-full h-full" allow="autoplay" title="YouTube Media" />
          ) : (
            <iframe src={`https://open.spotify.com/embed/track/${mediaId}?utm_source=generator&theme=0`} width="100%" height="100%" frameBorder="0" allow="autoplay" loading="lazy" title="Spotify Media" />
          )}
        </div>
        <div className="px-4 flex justify-between items-end">
          <div className="flex flex-col gap-1 max-w-[70%]">
             <span className="text-[10px] font-black tracking-widest text-white/30 uppercase">BAZA_RAHA_HAI</span>
             <p className="text-white text-2xl font-black truncate leading-tight tracking-tight">"{query}"</p>
          </div>
          <span className="text-[11px] font-mono tracking-[0.4em] text-white/40 uppercase mb-2 px-4 py-1.5 border border-white/10 rounded-full">{action}</span>
        </div>
      </div>
    </div>
  );
};

const SearchHUD: React.FC<{ active: boolean; results: any[]; onClose: () => void }> = ({ active, results, onClose }) => {
  if (!active || results.length === 0) return null;
  return (
    <div className="absolute top-36 left-12 w-[500px] z-50 animate-in fade-in slide-in-from-top-12 duration-700">
      <div className="bg-black/90 border-2 border-white/10 backdrop-blur-5xl rounded-[4rem] p-10 ring-1 ring-white/10 shadow-3xl">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
             <div className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_15px_#3b82f6]" />
             <span className="text-[14px] font-black tracking-[0.7em] text-white/80 uppercase">GYAAN_KI_BAATEIN</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-all p-4 hover:bg-white/10 rounded-full">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-6 flex flex-col gap-5">
           {results.map((chunk: any, idx: number) => {
             const title = chunk.web?.title || "Research Link";
             const uri = chunk.web?.uri;
             if (!uri) return null;
             return (
               <a key={idx} href={uri} target="_blank" rel="noopener noreferrer" className="block group p-7 rounded-[2.5rem] bg-white/5 border border-white/5 hover:border-white/20 transition-all hover:bg-white/10">
                 <p className="text-white/90 text-xl font-bold mb-3 group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">{title}</p>
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-white/20" />
                   <p className="text-white/30 text-[11px] font-mono truncate tracking-tight">{uri}</p>
                 </div>
               </a>
             );
           })}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentMood, setCurrentMood] = useState<'romantic'|'sad'|'inspirational'|'funny'|'excited'|'anxious'|'frustrated'|'default'>('default');
  const [mediaActive, setMediaActive] = useState(false);
  const [mediaPlatform, setMediaPlatform] = useState<'youtube' | 'spotify'>('youtube');
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaQuery, setMediaQuery] = useState('');
  const [mediaAction, setMediaAction] = useState('playing');
  const [perfActive, setPerfActive] = useState(false);
  const [perfType, setPerfType] = useState('');
  const [perfArtist, setPerfArtist] = useState('');
  const [perfDuration, setPerfDuration] = useState(0);
  const [perfElapsed, setPerfElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingBrain, setIsSyncingBrain] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string>('SYNCHRONIZED');

  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; nextStartTime: number; sources: Set<AudioBufferSourceNode>; } | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastActivityTimestamp = useRef<number>(Date.now());
  const perfIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (perfActive && perfElapsed < perfDuration) {
      perfIntervalRef.current = window.setInterval(() => {
        setPerfElapsed(prev => {
          if (prev >= perfDuration) {
            setPerfActive(false);
            if (perfIntervalRef.current) clearInterval(perfIntervalRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => { if (perfIntervalRef.current) clearInterval(perfIntervalRef.current); };
  }, [perfActive, perfDuration, perfElapsed]);

  useEffect(() => {
    let interval: number | null = null;
    if (isConnected) {
      interval = window.setInterval(() => {
        const now = Date.now();
        const diff = (now - lastActivityTimestamp.current) / 1000;
        if (diff >= 8 && !isSpeaking && !mediaActive && !perfActive) {
          if (sessionRef.current) {
            sessionRef.current.sendRealtimeInput({ media: { data: "AAAA", mimeType: "audio/pcm;rate=16000" } });
            lastActivityTimestamp.current = Date.now();
          }
        }
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isConnected, isSpeaking, mediaActive, perfActive]);

  const stopCall = useCallback(() => {
    if (sessionRef.current) { 
      sessionRef.current.close(); 
      sessionRef.current = null; 
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (audioContextRef.current) {
      audioContextRef.current.sources.forEach(s => { try { s.stop(); } catch(e) {} });
      audioContextRef.current.input.close(); audioContextRef.current.output.close();
      audioContextRef.current = null;
    }
    setIsConnected(false); setIsSpeaking(false); setSearchActive(false); setMediaActive(false); setPerfActive(false); setCurrentMood('default');
    setRecognizedUser(null);
  }, []);

  const startCall = async (isRetry = false) => {
    if (isConnecting && !isRetry) return;
    setIsConnecting(true); setError(null);

    try {
      const storedMemory = localStorage.getItem(MEMORY_STORAGE_KEY) || "Arre bhai memory khali hai... kaho kaisan ho?";
      const activeInstruction = MASTER_SYSTEM_INSTRUCTION.replace('{{USER_MEMORY}}', storedMemory);

      const ai = new GoogleGenAI({ apiKey:
      import.meta.env.VITE_GEMINI_API_KEY, });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = { input: inputCtx, output: outputCtx, nextStartTime: 0, sources: new Set() };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          tools,
          systemInstruction: activeInstruction,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true); setIsConnecting(false);
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(2048, 1, 1);
            processor.onaudioprocess = (e) => { 
               const inputData = e.inputBuffer.getChannelData(0);
               const hasVoice = inputData.some(v => Math.abs(v) > 0.01);
               if (hasVoice) lastActivityTimestamp.current = Date.now();
               sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(inputData) })); 
            };
            source.connect(processor); processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.groundingMetadata) {
              setSearchResults(msg.serverContent.groundingMetadata.groundingChunks || []);
              setSearchActive(true);
            }
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const args = fc.args as any;
                if (fc.name === 'sync_memory') {
                  setIsSyncingBrain(true);
                  localStorage.setItem(MEMORY_STORAGE_KEY, args.updated_summary);
                  setTimeout(() => setIsSyncingBrain(false), 3000);
                }
                if (fc.name === 'manage_voice_profile') {
                  if (args.action === 'save' || args.action === 'update') {
                    setRecognizedUser(args.userName);
                    setVoiceStatus('BFF_LOCKED');
                    const mem = localStorage.getItem(MEMORY_STORAGE_KEY) || "";
                    localStorage.setItem(MEMORY_STORAGE_KEY, `${mem}\nVOICE_ID: ${args.userName}. Details: ${args.profileDetails || 'None'}`);
                  } else if (args.action === 'forget') {
                    setRecognizedUser(null);
                    setVoiceStatus('BHUL_GAYE');
                    localStorage.removeItem(MEMORY_STORAGE_KEY);
                  }
                }
                if (fc.name === 'play_media') {
                  setMediaQuery(args.query); setMediaPlatform(args.platform);
                  setMediaAction('playing');
                  if (args.platform === 'youtube') {
                    const vId = args.mediaId || await searchYouTube(args.query);
                    if (vId) { setMediaId(vId); setMediaActive(true); }
                  } else if (args.platform === 'spotify') {
                    setMediaId(args.mediaId || null); setMediaActive(true);
                  }
                }
                if (fc.name === 'control_media') setMediaAction(args.action);
                if (fc.name === 'signal_mood') setCurrentMood(args.mood);
                if (fc.name === 'start_performance') {
                  setPerfType(args.performanceType); 
                  setPerfArtist(args.artistName || '');
                  setPerfDuration(args.expectedDurationSeconds);
                  setPerfElapsed(0); setPerfActive(true);
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Memory Updated" } } }));
              }
            }
            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              lastActivityTimestamp.current = Date.now();
              const { output: out, sources } = audioContextRef.current;
              setIsSpeaking(true);
              audioContextRef.current.nextStartTime = Math.max(audioContextRef.current.nextStartTime, out.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), out, 24000, 1);
              const source = out.createBufferSource();
              source.buffer = buffer; source.connect(out.destination);
              source.onended = () => { sources.delete(source); if (sources.size === 0) setIsSpeaking(false); };
              source.start(audioContextRef.current.nextStartTime);
              audioContextRef.current.nextStartTime += buffer.duration;
              sources.add(source);
            }
          },
          onerror: (e) => { setTimeout(() => startCall(true), 1200); },
          onclose: () => { if (isConnected) setTimeout(() => startCall(true), 1200); }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { 
      setError("NEURAL_SYNC_FAILED"); 
      setIsConnecting(false); 
      setTimeout(() => startCall(true), 4000); 
    }
  };

  const getMoodColor = () => {
    switch(currentMood) {
      case 'romantic': return 'border-pink-500 shadow-[0_0_450px_rgba(255,105,180,1)] bg-pink-950/40';
      case 'sad': return 'border-blue-700 shadow-[0_0_450px_rgba(30,144,255,1)] bg-blue-950/40';
      case 'excited': return 'border-yellow-400 shadow-[0_0_450px_rgba(253,224,71,1)] bg-yellow-900/40';
      case 'anxious': return 'border-purple-600 shadow-[0_0_450px_rgba(147,51,234,0.9)] bg-purple-950/40';
      case 'frustrated': return 'border-red-600 shadow-[0_0_450px_rgba(220,38,38,0.9)] bg-red-950/40';
      case 'inspirational': return 'border-emerald-500 shadow-[0_0_450px_rgba(16,185,129,1)] bg-emerald-950/40';
      case 'funny': return 'border-orange-500 shadow-[0_0_450px_rgba(249,115,22,1)] bg-orange-950/40';
      default: return 'border-white/30 shadow-[0_0_400px_rgba(255,255,255,0.4)] bg-black/60';
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#000] text-white relative overflow-hidden font-['Outfit']">
      
      {/* Allahabadi Branding */}
      <div className="absolute top-8 left-8 z-50 animate-in fade-in duration-1000">
         <span className="font-calligraphy text-2xl text-white/60 lowercase tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">ishu bff</span>
      </div>

      {/* Immersive Atmos */}
      <div className="absolute inset-0 transition-all duration-[4000ms] opacity-80">
        <div className={`absolute inset-0 transition-colors duration-[4000ms] ${getMoodColor().split(' ')[2]}`} />
        <div className="absolute inset-0 opacity-[0.1] bg-[size:200px_200px] bg-[radial-gradient(circle,#fff_2px,transparent_2px)]" />
      </div>

      {/* Main HUD */}
      <div className="absolute top-12 left-12 mt-12 flex flex-col gap-12 z-50 animate-in fade-in duration-1000">
        <div className="flex items-end gap-8">
          <div className={`w-14 h-14 rounded-full transition-all duration-700 ${isConnected ? 'bg-white animate-heartbeat-fast shadow-[0_0_100px_white]' : 'bg-red-900/40'}`} />
          <div className="flex flex-col">
             <span className="text-[18px] font-black uppercase tracking-[1.2em] text-white/30 mb-[-14px]">ALLAHABADI_SYNC</span>
             <h1 className="text-[10rem] font-calligraphy text-white drop-shadow-[0_0_80px_rgba(255,255,255,0.6)]">Ishu BFF</h1>
          </div>
        </div>
        {isConnected && (
          <div className="ml-32 px-16 py-7 bg-white/5 border border-white/10 rounded-full backdrop-blur-5xl shadow-3xl flex items-center gap-12 ring-1 ring-white/20">
             <div className="flex flex-col">
                <span className="text-[16px] font-mono tracking-[0.7em] text-white/70 uppercase leading-none">YAAR: {isSyncingBrain ? 'BAKAITI_SAVING' : (recognizedUser ? 'BHAI_MIL_GAYA' : 'READY')}</span>
                <span className="text-[12px] text-white/30 uppercase tracking-tighter mt-1 font-black">Allahabadi soul active...</span>
             </div>
             <div className={`w-6 h-6 rounded-full ${isSyncingBrain ? 'bg-blue-400 animate-pulse' : (recognizedUser ? 'bg-emerald-500 shadow-[0_0_20px_#10b981]' : 'bg-blue-500 animate-pulse')} shadow-[0_0_25px_white]`} />
          </div>
        )}
      </div>

      {/* Overlays */}
      <MemorySyncHUD active={isSyncingBrain} />
      <VoiceIdentityHUD name={recognizedUser || ""} status={voiceStatus} isSpeaking={isSpeaking} isSyncing={isSyncingBrain} />
      <SearchHUD active={searchActive} results={searchResults} onClose={() => setSearchActive(false)} />
      <MediaHUD active={mediaActive} platform={mediaPlatform} mediaId={mediaId} query={mediaQuery} action={mediaAction} onClose={() => setMediaActive(false)} />
      <PerformanceHUD active={perfActive} type={perfType} artist={perfArtist} duration={perfDuration} elapsed={perfElapsed} />

      {/* Neural Interface Core */}
      <div className="relative z-20">
        <div className={`w-[850px] h-[850px] rounded-full flex items-center justify-center transition-all duration-[2000ms] ${isConnected ? 'scale-100' : 'scale-90 opacity-40'}`}>
          <div className={`absolute inset-0 rounded-full border-[4px] border-white/5 ${isConnected ? 'animate-spin-slow' : ''}`} />
          <div className={`absolute inset-32 rounded-full border-[3px] border-white/5 opacity-40 ${isConnected ? 'animate-reverse-spin' : ''}`} />
          
          <button 
            onClick={!isConnected ? () => startCall() : undefined} 
            className={`group relative w-[520px] h-[520px] rounded-full flex flex-col items-center justify-center overflow-hidden border-[8px] transition-all duration-[800ms] backdrop-blur-5xl shadow-2xl ${isConnected ? `${getMoodColor()} animate-heartbeat-slow` : 'border-white/10 bg-white/5 hover:border-white/40'}`}
          >
            {isConnected ? (
              <div className="flex flex-col items-center gap-20">
                <div className="flex items-end gap-6 h-48">
                  {[...Array(32)].map((_, i) => (
                    <div key={i} className={`w-4.5 rounded-full transition-all duration-300 ${isSpeaking ? 'bg-white shadow-[0_0_60px_white]' : 'bg-white/10'}`} style={{ height: isSpeaking ? `${25 + Math.random() * 75}%` : '20%' }} />
                  ))}
                </div>
                <div className="flex flex-col items-center gap-4">
                  <span className={`text-[26px] font-black tracking-[2em] uppercase transition-all duration-[1000ms] ${isSpeaking ? 'text-white' : 'text-white/20'}`}>
                    {isSpeaking ? (perfActive ? 'POET_SOUL' : 'DIL_धडक_RAHA') : (recognizedUser ? `HELLO_${recognizedUser.split(' ')[0].toUpperCase()}` : 'SHARP_HEAR')}
                  </span>
                  <div className={`h-[6px] transition-all duration-[1000ms] rounded-full ${isSpeaking ? 'w-80 bg-white shadow-[0_0_50px_white]' : 'w-0'}`} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-16 group">
                <div className="w-40 h-40 rounded-full border-2 border-white/20 flex items-center justify-center shadow-3xl relative overflow-hidden bg-black/80">
                  <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-50 transition-all duration-700 group-hover:scale-150" />
                  <svg className="w-20 h-20 text-white/20 group-hover:text-white transition-all relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <span className="text-2xl font-black tracking-[1.8em] text-white/10 uppercase group-hover:text-white transition-all">Awaken_Yaar</span>
                </div>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Shutdown Action */}
      {isConnected && (
        <button onClick={stopCall} className="absolute bottom-16 px-48 py-12 rounded-full border border-white/10 text-2xl font-black uppercase tracking-[2em] bg-black/80 backdrop-blur-5xl hover:bg-red-950/90 transition-all text-white/20 hover:text-white z-50 group shadow-3xl overflow-hidden ring-1 ring-white/10">
          <div className="absolute inset-0 bg-red-600 opacity-0 group-hover:opacity-60 transition-opacity" />
          Kal_Milte_Hain
        </button>
      )}

      {/* Recovery HUD */}
      {error && !isConnected && (
        <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/99 backdrop-blur-5xl">
           <div className="flex flex-col items-center gap-20 p-28 text-center max-w-5xl animate-pulse">
            <div className="w-44 h-44 rounded-full border-[10px] border-white/10 flex items-center justify-center shadow-[0_0_150px_white] relative">
               <div className="absolute inset-0 border-t-4 border-white rounded-full animate-heartbeat-fast" />
               <span className="text-white text-[10rem] font-black">!</span>
            </div>
            <div className="flex flex-col gap-10">
              <p className="text-white font-black uppercase tracking-[0.7em] text-5xl">DIMAG_SYNC_ERROR</p>
              <p className="text-white/40 text-2xl font-mono uppercase tracking-[0.5em] leading-relaxed">Arre bhai ghabrana mat, recalibrate ho raha hai dimag...</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes reverse-spin { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes heartbeat {
          0% { transform: scale(1); }
          15% { transform: scale(1.05); }
          30% { transform: scale(1); }
          45% { transform: scale(1.08); }
          70% { transform: scale(1); }
        }
        .animate-spin-slow { animation: spin-slow 240s linear infinite; }
        .animate-reverse-spin { animation: reverse-spin 120s linear infinite; }
        .animate-heartbeat-slow { animation: heartbeat 3.5s ease-in-out infinite; }
        .animate-heartbeat-fast { animation: heartbeat 1.2s ease-in-out infinite; }
         /* Mobile Specific Overrides */
        @media (max-width: 600px) {
          .font-calligraphy { font-size: 1.1em; }
          h1.text-4xl { font-size: 2.8rem; line-height: 1; margin-top: 4px; }
          .backdrop-blur-3xl { backdrop-filter: blur(20px); }
          .shadow-3xl { shadow: 0 10px 30px rgba(0,0,0,0.5); }
        }
      `}</style>
    </div>
  );
};


export default App;
