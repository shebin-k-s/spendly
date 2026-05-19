import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/apiClient';

export default function AiTestPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUrl(URL.createObjectURL(file));
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Tell backend to send prompt metrics back
      const { data } = await apiClient.post('/expenses/parse-image?debug=true', formData);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error occurred while analyzing image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-secondary shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-secondary rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">AI Tuning Playground</h1>
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange}
          className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
        />
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0">
        
        {/* Left Column: Image & Status */}
        <div className="p-4 border-b lg:border-b-0 lg:border-r border-secondary flex flex-col gap-4 bg-secondary/10">
          <h2 className="font-semibold text-lg">Input</h2>
          {loading && (
            <div className="bg-primary/10 text-primary p-4 rounded-xl border border-primary/20 animate-pulse font-medium">
              Running vision model...
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 font-medium">
              {error}
            </div>
          )}
          {imageUrl ? (
            <img src={imageUrl} alt="preview" className="rounded-xl border border-secondary w-[400px] h-[400px] max-w-full object-cover bg-background mx-auto shadow-sm" />
          ) : (
            <div className="w-[400px] h-[400px] max-w-full border-2 border-dashed border-secondary rounded-xl flex items-center justify-center text-muted-foreground bg-background mx-auto">
              Upload an image to start
            </div>
          )}
        </div>

        {/* Middle Column: Prompt Engine */}
        <div className="p-4 border-b lg:border-b-0 lg:border-r border-secondary flex flex-col gap-2">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            AI Prompt (System Instructions)
          </h2>
          <div className="bg-secondary/20 p-4 rounded-xl border border-secondary">
            {!result ? (
              <p className="text-muted-foreground italic">Waiting for execution...</p>
            ) : (
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap word-break">
                {result._debug?.prompt || "Prompt payload was not returned. Did you enable ?debug=true?"}
              </pre>
            )}
          </div>
        </div>

        {/* Right Column: AI Output */}
        <div className="p-4 flex flex-col gap-2">
          <h2 className="font-semibold text-lg flex justify-between items-center">
            Extracted Data
            {result && <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-500 rounded-md">Success</span>}
          </h2>
          <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20 font-mono text-xs">
            {!result ? (
              <p className="text-muted-foreground italic">Response will appear here...</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-emerald-500/70 mb-1 font-bold">RAW JSON RESPONSE:</div>
                  <pre className="whitespace-pre-wrap word-break text-foreground">
                    {JSON.stringify(result._debug?.rawText ? JSON.parse(result._debug.rawText) : result, null, 2)}
                  </pre>
                </div>
                {result._debug?.rawText && result.category_name && (
                  <div className="pt-4 border-t border-emerald-500/20">
                    <div className="text-emerald-500/70 mb-1 font-bold">MAPPED FRONTEND PAYLOAD:</div>
                    <pre className="whitespace-pre-wrap text-foreground">
                      {JSON.stringify({ ...result, _debug: undefined }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
