import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreateCategory } from '../hooks/useCategories';

const PRESET_ICONS = ['🍔', '🚗', '🛒', '🏥', '🎬', '🛍️', '💡', '📱', '✈️', '🏠', '📚', '🔧', '👨‍👩‍👧', '🎁', '💼', '📦'];
const PRESET_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#ef4444',
  '#a855f7', '#ec4899', '#eab308', '#06b6d4',
  '#0ea5e9', '#64748b', '#8b5cf6', '#78716c',
];

export default function AddCategoryPage() {
  const navigate = useNavigate();
  const createCategory = useCreateCategory();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#f97316');

  const canSubmit = name.trim().length > 0 && !createCategory.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createCategory.mutate(
      { name: name.trim(), icon, color },
      { onSuccess: () => navigate('/categories') },
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold">New Category</h1>
      </div>

      <div className="page-content space-y-6">
        {/* Preview */}
        <div className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${color}22` }}
          >
            {icon}
          </div>
          <div>
            <p className="font-semibold">{name || 'Category Name'}</p>
            <p className="text-xs text-muted-foreground">Preview</p>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="form-label">Category Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coffee & Snacks"
            className="form-input"
          />
        </div>

        {/* Icon picker */}
        <div>
          <label className="form-label">Icon</label>
          <div className="grid grid-cols-8 gap-2">
            {PRESET_ICONS.map((e) => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`h-10 rounded-xl text-xl flex items-center justify-center transition-colors
                  ${icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="form-label">Color</label>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-10 rounded-xl transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-background' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
          {createCategory.isPending ? 'Creating...' : 'Create Category'}
        </button>
      </div>
    </div>
  );
}
