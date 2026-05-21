import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, ChevronRight, Phone, Search, X } from 'lucide-react';
import { usePeople, useCreatePerson } from '../hooks/usePeople';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/EmptyState';

export default function PeoplePage() {
  const navigate = useNavigate();
  const { data: people = [], isLoading } = usePeople();
  const createPerson = useCreatePerson();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const filteredPeople = people.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createPerson.mutate(
      { name: newName.trim(), phoneNumber: newPhone.trim() || undefined },
      {
        onSuccess: () => {
          setNewName('');
          setNewPhone('');
          setShowAddForm(false);
        },
      },
    );
  };

  const totalOwedToMe = people
    .filter(p => p.balance > 0)
    .reduce((sum, p) => sum + Number(p.balance), 0);
  const totalIOwe = people
    .filter(p => p.balance < 0)
    .reduce((sum, p) => sum + Math.abs(Number(p.balance)), 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Lend & Borrow</p>
          <h1 className="text-xl font-bold">People</h1>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center transition-all active:opacity-80',
            showAddForm
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {showAddForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        </button>
      </div>

      <div className="page-content space-y-4">
        {/* Add Person Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddPerson}
            className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Person</p>
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                className="form-input"
                autoFocus
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (Optional)"
                className="form-input"
              />
            </div>
            <button
              type="submit"
              disabled={!newName.trim() || createPerson.isPending}
              className="btn-primary"
            >
              {createPerson.isPending ? 'Adding...' : 'Add Person'}
            </button>
          </form>
        )}

        {/* Summary — only when there are non-zero balances */}
        {!isLoading && people.length > 0 && (totalOwedToMe > 0 || totalIOwe > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">They owe you</p>
              <p className="text-base font-bold text-primary mt-0.5">{formatINR(totalOwedToMe)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">You owe them</p>
              <p className="text-base font-bold text-destructive mt-0.5">{formatINR(totalIOwe)}</p>
            </div>
          </div>
        )}

        {/* Search — only when there are people */}
        {!isLoading && people.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full bg-card border border-border rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[60px] rounded-2xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredPeople.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchQuery ? 'No one matches your search' : 'No people added yet'}
            description={searchQuery ? undefined : 'Tap + to add someone you lent money to or borrowed from.'}
          />
        ) : (
          <div className="space-y-2">
            {filteredPeople.map((person) => (
              <button
                key={person.id}
                onClick={() => navigate(`/people/${person.id}`)}
                className="touch-card w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {/* Avatar — primary color, initial letter */}
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {person.name[0].toUpperCase()}
                </div>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{person.name}</p>
                    {person.phoneNumber && (
                      <Phone className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {person.balance === 0
                      ? 'Settled up'
                      : person.balance > 0
                        ? 'Owes you'
                        : 'You owe'}
                  </p>
                </div>

                {/* Amount + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  {person.balance !== 0 && (
                    <p className={cn(
                      'text-sm font-semibold',
                      person.balance > 0 ? 'text-primary' : 'text-destructive',
                    )}>
                      {formatINR(Math.abs(Number(person.balance)))}
                    </p>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
