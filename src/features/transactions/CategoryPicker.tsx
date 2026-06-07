import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { Category } from '@/db/schema'

interface Props {
  value: number | null
  categories: Category[]
  onChange: (categoryId: number) => void
}

export function CategoryPicker({ value, categories, onChange }: Props) {
  const selectedName = value !== null && value !== undefined
    ? (categories.find(c => c.id === value)?.name ?? 'Sem categoria')
    : 'Sem categoria'

  return (
    <Select
      value={value !== null && value !== undefined ? String(value) : ''}
      onValueChange={v => { if (v !== null) onChange(parseInt(v)) }}
    >
      <SelectTrigger className="h-7 text-xs w-40">
        <span className="flex-1 text-left truncate">{selectedName}</span>
      </SelectTrigger>
      <SelectContent>
        {categories.map(cat => (
          <SelectItem key={cat.id} value={cat.id!.toString()}>
            {cat.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
