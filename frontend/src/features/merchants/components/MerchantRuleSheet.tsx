import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronRight, Loader2, Store, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { CategoryPicker } from '@/features/categories/components/CategoryPicker';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { useCreateMerchantRule, useDeleteMerchantRule, useUpdateMerchantRule } from '../hooks/useMerchantRules';
import type { MerchantRule } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null → adding a new shop
  rule: MerchantRule | null;
}

function parseAliases(text: string): string[] {
  return text.split(',').map((a) => a.trim()).filter(Boolean);
}

export function MerchantRuleSheet({ open, onOpenChange, rule }: Props) {
  const { data: categories = [] } = useCategoriesQuery();
  const createRule = useCreateMerchantRule();
  const updateRule = useUpdateMerchantRule();
  const deleteRule = useDeleteMerchantRule();
  const isPending = createRule.isPending || updateRule.isPending || deleteRule.isPending;

  const [name, setName] = useState('');
  const [aliasText, setAliasText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form each time the sheet opens, for whichever shop it opened with.
  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? '');
    setAliasText(rule?.aliases.join(', ') ?? '');
    setCategoryId(rule?.category.id ?? '');
  }, [open, rule]);

  const category = categories.find((c) => c.id === categoryId);
  const canSave = name.trim().length > 0 && !!categoryId && !isPending;

  const handleSave = () => {
    if (!canSave) return;
    const payload = { name: name.trim(), aliases: parseAliases(aliasText), categoryId };
    const close = { onSuccess: () => onOpenChange(false) };
    if (rule) updateRule.mutate({ id: rule.id, ...payload }, close);
    else createRule.mutate(payload, close);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        header={(
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Store className="w-5 h-5" />
            </div>
            <Dialog.Title className="text-base font-bold">{rule ? 'Edit Shop' : 'Add Shop'}</Dialog.Title>
          </div>
        )}
      >
        <div className="px-4 pb-8 pt-2 space-y-5">
          <div>
            <label className="form-label">Shop name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Ayaans Mart"
              enterKeyHint="next"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">Other names (comma separated)</label>
            <input
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Ayaans, Ayaan's"
              enterKeyHint="done"
              className="form-input"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Different spellings you might type. Capital letters don't matter.
            </p>
          </div>

          <div>
            <label className="form-label">Always put in category</label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={isPending}
              className="form-input flex items-center gap-3 text-left"
            >
              {category ? (
                <>
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base icon-badge shrink-0"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.icon}
                  </span>
                  <span className="flex-1 font-medium">{category.name}</span>
                </>
              ) : (
                <span className="flex-1 text-muted-foreground">Choose a category</span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="flex gap-3">
            {rule && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isPending}
                aria-label="Delete shop"
                className="w-14 shrink-0 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center active:opacity-60 transition-opacity"
              >
                {deleteRule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
            <button type="button" onClick={handleSave} disabled={!canSave} className="btn-primary">
              {createRule.isPending || updateRule.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : rule ? 'Save Changes' : 'Add Shop'}
            </button>
          </div>
        </div>
      </BottomSheet>

      <CategoryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={categoryId ? [categoryId] : []}
        onSelect={(id) => setCategoryId(id)}
        title="Select Category"
      />

      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Shop"
        description={`Delete "${rule?.name}"? The AI will stop putting this shop's purchases in ${rule?.category.name ?? 'its category'}. Existing expenses won't change.`}
        isLoading={deleteRule.isPending}
        onConfirm={() =>
          rule && deleteRule.mutate(rule.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onOpenChange(false);
            },
          })
        }
      />
    </>
  );
}
