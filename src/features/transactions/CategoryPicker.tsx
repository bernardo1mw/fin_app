import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import type { SelectChangeEvent } from '@mui/material/Select'
import type { Category } from '@/db/schema'

interface Props {
  value: string | null
  categories: Category[]
  onChange: (categoryId: string) => void
}

export function CategoryPicker({ value, categories, onChange }: Props) {
  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <Select
        value={value ?? ''}
        onChange={(e: SelectChangeEvent<string>) => {
          if (e.target.value) onChange(e.target.value)
        }}
        displayEmpty
        sx={{ fontSize: 13 }}
      >
        <MenuItem value=""><em style={{ fontSize: 13 }}>Sem categoria</em></MenuItem>
        {categories.map(cat => (
          <MenuItem key={cat.id} value={cat.id!} sx={{ fontSize: 13, gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color, flexShrink: 0 }} />
            {cat.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
