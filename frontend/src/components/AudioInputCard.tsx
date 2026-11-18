import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Mic,
  Square,
  Play,
  RotateCcw,
  Trash2,
  FileAudio,
  AlertCircle,
  Clock,
  HardDrive,
  Info,
} from 'lucide-react';

interface AudioInputCardProps {
  onAudioReady: (file: File | null, durationSec: number | null, sourceLabel: string) => void;
  isProcessing: boolean;
  selectedPromptText?: string;
}

export const AudioInputCard: React.FC<AudioInputCardProps> = ({
  onAudioReady,
  isProcessing,
  selectedPromptText,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'record'>('upload');

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadDuration, setUploadDuration] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Supported MIME types and extensions
  const ALLOWED_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac', '.aac', '.mp4'];
  const MAX_SIZE_MB = 50;

  // Clean up recorded blob URL on unmount
  useEffect(() => {
    return () => {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
    };
  }, [recordedUrl]);

  // Handle uploaded file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndSelectFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  };

  const validateAndSelectFile = (file: File) => {
    setUploadError(null);

    // Validate size
    if (file.size === 0) {
      setUploadError('The selected file is empty (0 bytes).');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`File is too large. Maximum size for testing is ${MAX_SIZE_MB} MB.`);
      return;
    }

    // Validate extension
    const name = file.name.toLowerCase();
    const validExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!validExt) {
      setUploadError(
        `Unsupported format. Please select one of: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
      return;
    }

    setUploadedFile(file);

    // Read audio duration using audio element
    const objUrl = URL.createObjectURL(file);
    const audio = new Audio(objUrl);
    audio.onloadedmetadata = () => {
      const dur = Math.round(audio.duration * 10) / 10;
      setUploadDuration(dur);
      onAudioReady(file, dur, file.name);
      URL.revokeObjectURL(objUrl);
    };
    audio.onerror = () => {
      // Still allow submission even if browser cannot decode metadata directly
      setUploadDuration(null);
      onAudioReady(file, null, file.name);
      URL.revokeObjectURL(objUrl);
    };
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setUploadDuration(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (activeTab === 'upload') {
      onAudioReady(null, null, '');
    }
  };

  // Start audio recording
  const startRecording = async () => {
    setRecordingError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    audioChunksRef.current = [];

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecordingError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      // Request microphone permission only when user clicks Start
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine supported mimeType
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];
      let selectedMimeType = '';
      for (const t of mimeTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          selectedMimeType = t;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordedBlob(blob);

        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        // Calculate recorded duration
        const finalSec = recordSeconds;
        const extension = mime.includes('mp4') ? 'mp4' : mime.includes('wav') ? 'wav' : 'webm';
        const recordedFile = new File([blob], `mic_recording_${Date.now()}.${extension}`, { type: mime });

        onAudioReady(recordedFile, finalSec, `Microphone Recording (${finalSec}s)`);
      };

      recorder.start(250); // slice every 250ms
      setIsRecording(true);
      setRecordSeconds(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setRecordingError('Microphone permission was denied. Please allow microphone access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setRecordingError('No microphone hardware detected on your device.');
      } else {
        setRecordingError(`Could not access microphone: ${err.message || 'Unknown error'}`);
      }
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Discard recording
  const clearRecording = () => {
    if (isRecording) {
      stopRecording();
    }
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    setRecordedBlob(null);
    setRecordSeconds(0);
    setRecordingError(null);
    if (activeTab === 'record') {
      onAudioReady(null, null, '');
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
            <FileAudio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Audio Input</h2>
            <p className="text-xs text-slate-400">
              Provide speech audio via direct file upload or microphone recording
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 bg-slate-950/80 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => {
              setActiveTab('upload');
              if (uploadedFile) {
                onAudioReady(uploadedFile, uploadDuration, uploadedFile.name);
              } else {
                onAudioReady(null, null, '');
              }
            }}
            disabled={isRecording || isProcessing}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('record');
              if (recordedBlob) {
                const mime = recordedBlob.type || 'audio/webm';
                const file = new File([recordedBlob], 'mic_recording.webm', { type: mime });
                onAudioReady(file, recordSeconds, 'Microphone Recording');
              } else {
                onAudioReady(null, null, '');
              }
            }}
            disabled={isRecording || isProcessing}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'record'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Record Mic (Optional)</span>
          </button>
        </div>
      </div>

      {/* Teleprompter prompt indicator when a prompt is selected */}
      {selectedPromptText && (
        <div className="mt-4 p-3 bg-teal-950/30 border border-teal-500/30 rounded-lg text-xs">
          <div className="flex items-center gap-1.5 text-teal-400 font-medium mb-1">
            <Info className="w-3.5 h-3.5" />
            <span>Selected Test Prompt (Read this phrase aloud for testing):</span>
          </div>
          <p className="text-white font-mono text-sm bg-slate-950/60 p-2 rounded border border-teal-500/20">
            "{selectedPromptText}"
          </p>
        </div>
      )}

      {/* Upload Tab Content */}
      {activeTab === 'upload' && (
        <div className="mt-4 space-y-3">
          {!uploadedFile ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 bg-slate-950/40 hover:bg-slate-950/70 rounded-xl p-8 text-center cursor-pointer transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-teal-400 mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                Click to browse or drag and drop audio file
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Supported formats: WAV, MP3, M4A, WebM, OGG, FLAC (Max {MAX_SIZE_MB} MB)
              </p>
              <div className="inline-block mt-3 px-3 py-1 bg-slate-800/70 border border-slate-700 rounded text-[11px] text-slate-300">
                Original audio format is preserved directly for AssemblyAI upload
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400 mt-0.5">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white break-all">
                      {uploadedFile.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        {formatFileSize(uploadedFile.size)}
                      </span>
                      {uploadDuration !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          Duration: {uploadDuration}s
                        </span>
                      )}
                      <span className="text-emerald-400 font-medium">Valid file ready</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs transition-colors"
                    title="Replace file"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={clearUpload}
                    disabled={isProcessing}
                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md text-xs transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS.join(',')}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Audio Player Preview */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">
                  Audio Preview
                </label>
                <audio
                  ref={uploadAudioRef}
                  src={URL.createObjectURL(uploadedFile)}
                  controls
                  className="w-full h-9 rounded"
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {/* Record Tab Content */}
      {activeTab === 'record' && (
        <div className="mt-4 space-y-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center">
            {/* Live recording indicator */}
            {isRecording ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                    Recording Live Audio
                  </span>
                </div>

                <div className="text-3xl font-mono font-bold text-white tracking-wider">
                  {formatTime(recordSeconds)}
                </div>

                <p className="text-xs text-slate-400">
                  Speak clearly into your microphone. Say filler words like "um" or "uh" to test disfluency preservation.
                </p>

                <button
                  onClick={stopRecording}
                  className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-medium text-xs flex items-center gap-2 mx-auto transition-all shadow-lg shadow-rose-950/50"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Recording</span>
                </button>
              </div>
            ) : recordedUrl ? (
              /* Recorded audio playback and actions */
              <div className="space-y-4">
                <div className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>Recording Finished ({recordSeconds}s) — Playback Ready</span>
                </div>

                <audio src={recordedUrl} controls className="w-full max-w-md mx-auto h-10" />

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-record</span>
                  </button>
                  <button
                    onClick={clearRecording}
                    disabled={isProcessing}
                    className="px-3.5 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discard</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Idle recording state */
              <div className="space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <Mic className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    Microphone Audio Recorder
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Microphone permission is only requested when you click the button below. Uses your browser's native MediaRecorder API.
                  </p>
                </div>

                <button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-medium text-xs flex items-center gap-2 mx-auto transition-all shadow-md shadow-teal-950/40"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Recording</span>
                </button>
              </div>
            )}
          </div>

          {recordingError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{recordingError}</span>
            </div>
          )}

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>Note: In-browser recording is optional; file upload above functions completely independently.</span>
          </div>
        </div>
      )}
    </div>
  );
};
