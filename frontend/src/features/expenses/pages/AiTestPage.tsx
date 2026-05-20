import { useState } from 'react';
import { ArrowLeft, Image, Type } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/apiClient';

type Mode = 'image' | 'text';

function parseRawText(rawText: string): unknown {
  const stripped = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try { return JSON.parse(stripped); } catch { return rawText; }
}

function ResultPanel({ result }: { result: any }) {
  const rawJson = result._debug?.rawText ? parseRawText(result._debug.rawText) : result;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-emerald-500/70 mb-1 font-bold">RAW JSON RESPONSE:</div>
        <pre className="whitespace-pre-wrap word-break text-foreground">
          {JSON.stringify(rawJson, null, 2)}
        </pre>
      </div>
      {result._debug?.rawText && (
        <div className="pt-4 border-t border-emerald-500/20">
          <div className="text-emerald-500/70 mb-1 font-bold">MAPPED FRONTEND PAYLOAD:</div>
          <pre className="whitespace-pre-wrap text-foreground">
            {JSON.stringify({ ...result, _debug: undefined }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AiTestPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('image');

  // Image mode state
  const [imageLoading, setImageLoading] = useState(false);
  const [imageResult, setImageResult] = useState<any>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Text mode state
  const [textInput, setTextInput] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textResult, setTextResult] = useState<any>(null);
  const [textError, setTextError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setImageLoading(true);
    setImageResult(null);
    setImageError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await apiClient.post('/expenses/parse-image?debug=true', formData);
      setImageResult(data);
    } catch (err: any) {
      setImageError(err.message || 'Error occurred while analyzing image');
    } finally {
      setImageLoading(false);
    }
  };

  const handleTextParse = async () => {
    if (!textInput.trim() || textLoading) return;
    setTextLoading(true);
    setTextResult(null);
    setTextError(null);
    try {
      const { data } = await apiClient.post('/expenses/parse-text?debug=true', { text: textInput.trim() });
      setTextResult(data);
    } catch (err: any) {
      setTextError(err.message || 'Error occurred while parsing text');
    } finally {
      setTextLoading(false);
    }
  };

  const result = mode === 'image' ? imageResult : textResult;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-secondary shrink-0">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">AI Tuning Playground</h1>

        {/* Mode toggle */}
        <div className="flex items-center bg-secondary rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('image')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'image' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            <Image className="w-3.5 h-3.5" /> Image
          </button>
          <button
            onClick={() => setMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            <Type className="w-3.5 h-3.5" /> Text
          </button>
        </div>

        {mode === 'image' && (
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />
        )}
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0">

        {/* Left Column: Input */}
        <div className="p-4 border-b lg:border-b-0 lg:border-r border-secondary flex flex-col gap-4 bg-secondary/10">
          <h2 className="font-semibold text-lg">Input</h2>

          {mode === 'image' ? (
            <>
              {imageLoading && (
                <div className="bg-primary/10 text-primary p-4 rounded-xl border border-primary/20 animate-pulse font-medium">
                  Running vision model...
                </div>
              )}
              {imageError && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 font-medium">
                  {imageError}
                </div>
              )}
              {imageUrl ? (
                <img src={imageUrl} alt="preview" className="rounded-xl border border-secondary w-[400px] h-[400px] max-w-full object-cover bg-background mx-auto shadow-sm" />
              ) : (
                <div className="w-[400px] h-[400px] max-w-full border-2 border-dashed border-secondary rounded-xl flex items-center justify-center text-muted-foreground bg-background mx-auto">
                  Upload an image to start
                </div>
              )}
            </>
          ) : (
            <>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleTextParse(); } }}
                placeholder={'Type a natural language expense...\ne.g. "Zomato 350 UPI" or "paid 80 cash for coffee at CCD"'}
                rows={5}
                className="w-full bg-background border border-secondary rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => void handleTextParse()}
                disabled={!textInput.trim() || textLoading}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              >
                {textLoading ? 'Parsing...' : 'Parse with AI'}
              </button>
              {textError && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 font-medium text-sm">
                  {textError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Middle Column: Prompt */}
        <div className="p-4 border-b lg:border-b-0 lg:border-r border-secondary flex flex-col gap-2">
          <h2 className="font-semibold text-lg">AI Prompt (System Instructions)</h2>
          <div className="bg-secondary/20 p-4 rounded-xl border border-secondary flex-1">
            {!result ? (
              <p className="text-muted-foreground italic">Waiting for execution...</p>
            ) : (
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap word-break">
                {result._debug?.prompt || 'Prompt not returned.'}
              </pre>
            )}
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="p-4 flex flex-col gap-2">
          <h2 className="font-semibold text-lg flex justify-between items-center">
            Extracted Data
            {result && <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-500 rounded-md">Success</span>}
          </h2>
          <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20 font-mono text-xs">
            {!result ? (
              <p className="text-muted-foreground italic">Response will appear here...</p>
            ) : (
              <ResultPanel result={result} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
