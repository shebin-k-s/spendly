import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Trash2, Loader2, Check } from 'lucide-react';
import { usePerson, useUpdatePerson, useDeletePerson } from '../hooks/usePeople';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export default function EditPersonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialPerson = location.state?.person;

  const { data: person, isLoading } = usePerson(id!);
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();

  const [name, setName] = useState(initialPerson?.name || '');
  const [phone, setPhone] = useState(initialPerson?.phoneNumber || '');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setPhone(person.phoneNumber ?? '');
    }
  }, [person]);

  const isChanged = person ? (
    name.trim() !== (person.name?.trim() || '') ||
    phone.trim() !== (person.phoneNumber?.trim() || '')
  ) : false;

  const canSubmit = name.trim().length > 0 && isChanged && !updatePerson.isPending;

  const handleSave = () => {
    if (!canSubmit || !id) return;
    updatePerson.mutate(
      { id, payload: { name: name.trim(), phoneNumber: phone.trim() || undefined } },
      { onSuccess: () => navigate(-1) },
    );
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div className="w-10 h-10 rounded-2xl bg-muted animate-pulse shrink-0" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded-lg flex-1" />
        </div>
        <div className="page-content space-y-5">
          {[1, 2].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-12 bg-card border border-border rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!person) return null;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Edit Person</h1>
        <button
          onClick={handleSave}
          disabled={!canSubmit}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
        >
          {updatePerson.isPending ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Check className="w-4 h-4 text-primary" />
          )}
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={deletePerson.isPending}
          className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive active:opacity-60 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="page-content space-y-5">
        <div>
          <label className="form-label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="form-input"
          />
        </div>

        <div>
          <label className="form-label">Phone (Optional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            inputMode="tel"
            className="form-input"
          />
        </div>

        <button onClick={handleSave} disabled={!canSubmit} className="btn-primary">
          {updatePerson.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : 'Save Changes'}
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Person"
        description={`Delete ${person.name} and all their transaction history? This cannot be undone.`}
        onConfirm={() =>
          deletePerson.mutate(id!, { onSuccess: () => navigate(-1) })
        }
      />
    </div>
  );
}
