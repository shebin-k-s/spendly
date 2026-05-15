import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useCategoriesQuery, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const DEFAULT_ICONS = ['🍔', '🚗', '🛒', '🏥', '🎬', '🛍️', '💡', '📱', '✈️', '🏠', '📚', '🔧', '👨‍👩‍👧', '🎁', '💼', '📦'];

export default function EditCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategoriesQuery();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const category = categories.find((c) => c.id === id);

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

  useEffect(() => {
    if (category) {
      setName(category.name);
      setIcon(category.icon);
      setColor(category.color);
    }
  }, [category]);

  const canSubmit = name.trim().length > 0 && !updateCategory.isPending;

  const handleSubmit = () => {
    if (!canSubmit || !id) return;
    
    // Save to lifelong custom icons if it's not a default icon
    if (icon && !DEFAULT_ICONS.includes(icon)) {
      const updated = Array.from(new Set([...savedCustomIcons, icon]));
      localStorage.setItem('spendly_custom_icons', JSON.stringify(updated));
    }
    
    updateCategory.mutate(
      { id, name: name.trim(), icon, color },
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
        <h1 className="text-xl font-bold flex-1">Edit Category</h1>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={deleteCategory.isPending}
          className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive active:opacity-60 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
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
          <div className="ml-auto w-1.5 h-12 rounded-full" style={{ backgroundColor: color }} />
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
          {updateCategory.isPending ? 'Saving...' : 'Save Changes'}
        </button>

        <ConfirmModal
          open={showDeleteModal}
          onOpenChange={setShowDeleteModal}
          title="Delete Category"
          description={`Delete "${category?.name}"? Expenses using it won't be deleted.`}
          onConfirm={() =>
            deleteCategory.mutate(id!, { onSuccess: () => navigate('/categories') })
          }
        />
      </div>
    </div>
  );
}
