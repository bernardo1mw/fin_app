import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import type { SelectChangeEvent } from '@mui/material/Select'
import type { Category } from '@/db/schema'

interface Props {
  value: number | null
  categories: Category[]
  onChange: (categoryId: number) => void
}

export function CategoryPicker({ value, categories, onChange }: Props) {
  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <Select
        value={value !== null && value !== undefined ? String(value) : ''}
        onChange={(e: SelectChangeEvent<string>) => {
          if (e.target.value !== '') onChange(Number(e.target.value))
        }}
        displayEmpty
        sx={{ fontSize: 13 }}
      >
        <MenuItem value=""><em style={{ fontSize: 13 }}>Sem categoria</em></MenuItem>
        {categories.map(cat => (
          <MenuItem key={cat.id} value={String(cat.id)} sx={{ fontSize: 13 }}>{cat.name}</MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
