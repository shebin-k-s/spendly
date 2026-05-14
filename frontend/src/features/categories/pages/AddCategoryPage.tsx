import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreateCategory, useCategoriesQuery } from '../hooks/useCategories';

const DEFAULT_ICONS = ['🍔', '🚗', '🛒', '🏥', '🎬', '🛍️', '💡', '📱', '✈️', '🏠', '📚', '🔧', '👨‍👩‍👧', '🎁', '💼', '📦'];
const PRESET_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#ef4444',
  '#a855f7', '#ec4899', '#eab308', '#06b6d4',
  '#0ea5e9', '#64748b', '#8b5cf6', '#78716c',
];

export default function AddCategoryPage() {
  const navigate = useNavigate();
  const createCategory = useCreateCategory();
  const { data: categories = [] } = useCategoriesQuery();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#f97316');

  const getSavedIcons = () => {
    try {
      return JSON.parse(localStorage.getItem('spendly_custom_icons') || '[]');
    } catch {
      return [];
    }
  };

  const savedCustomIcons = getSavedIcons();
  const categoryCustomIcons = categories.map((c) => c.icon).filter((i) => !DEFAULT_ICONS.includes(i));
  const customIcons = Array.from(new Set([...savedCustomIcons, ...categoryCustomIcons]));
  
  const PRESET_ICONS = [...DEFAULT_ICONS, ...customIcons];

  const canSubmit = name.trim().length > 0 && !createCategory.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    
    // Save to lifelong custom icons if it's not a default icon
    if (icon && !DEFAULT_ICONS.includes(icon)) {
      const updated = Array.from(new Set([...savedCustomIcons, icon]));
      localStorage.setItem('spendly_custom_icons', JSON.stringify(updated));
    }
    
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
            style={{ backgroundColor: color }}
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
            
            <input
              type="text"
              maxLength={2}
              className={`h-10 rounded-xl text-xl flex items-center justify-center text-center transition-colors focus:outline-none
                ${!PRESET_ICONS.includes(icon) && icon ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary placeholder:text-muted-foreground'}`}
              value={!PRESET_ICONS.includes(icon) ? icon : ''}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="+"
            />
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="form-label">Color</label>
          <div className="flex items-center gap-4 mt-2">
            <div 
              className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-border/50 ring-2 ring-primary/20 shadow-sm transition-all"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-[-10px] w-[150%] h-[150%] opacity-0 cursor-pointer"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Select Color</span>
              <span className="text-xs text-muted-foreground uppercase">{color}</span>
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
          {createCategory.isPending ? 'Creating...' : 'Create Category'}
        </button>
      </div>
    </div>
  );
}
