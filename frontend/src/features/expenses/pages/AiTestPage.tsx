import { useState } from 'react';
import apiClient from '@/lib/apiClient';

export default function AiTestPage() {
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

      const { data } = await apiClient.post('/expenses/parse-image', formData);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">AI Scanner Test</h1>
      
      <div>
        <label className="block mb-2 text-sm font-medium">Upload Receipt Image</label>
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
        />
      </div>

      {loading && <p className="text-primary animate-pulse">Analyzing image via AI...</p>}
      
      {error && <p className="text-destructive font-medium bg-destructive/10 p-4 rounded-xl border border-destructive/20">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {imageUrl && (
          <div className="border border-secondary rounded-xl p-2 hide-scrollbar overflow-auto">
            <img src={imageUrl} alt="preview" className="max-h-[60vh] object-contain rounded-lg" />
          </div>
        )}

        {result && (
          <div className="bg-secondary/50 rounded-xl p-4 overflow-auto border border-secondary relative h-full">
            <h3 className="font-semibold mb-2">Raw JSON Response:</h3>
            <pre className="text-xs font-mono text-secondary-foreground whitespace-pre-wrap word-break">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
