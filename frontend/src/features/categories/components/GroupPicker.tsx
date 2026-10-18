import { useCategoryGroupsQuery } from '../hooks/useCategoryGroups';

interface GroupPickerProps {
  value: string;
  onChange: (group: string) => void;
}

export default function GroupPicker({ value, onChange }: GroupPickerProps) {
  const { data: groups = [] } = useCategoryGroupsQuery();
  return (
    <div>
      <label className="form-label">Group</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.name)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors
              ${value === g.name ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
          >
            {g.name}
          </button>
        ))}
      </div>
    </div>
  );
}
