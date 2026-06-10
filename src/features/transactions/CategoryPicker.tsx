import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import type { SelectChangeEvent } from '@mui/material/Select'
import type { Category } from '@/db/schema'

interface Props {
  value: string | null
  categories: Category[]
  onChange: (categoryId: string) => void
}

export function CategoryPicker({ value, categories, onChange }: Props) {
  const selected = categories.find(c => c.id === value)

  return (
    <FormControl size="small" sx={{ width: { xs: 130, sm: 160 } }}>
      <Select
        value={value ?? ''}
        onChange={(e: SelectChangeEvent<string>) => {
          if (e.target.value) onChange(e.target.value)
        }}
        displayEmpty
        renderValue={() =>
          selected ? (
            <Chip
              label={selected.name}
              size="small"
              sx={{ bgcolor: selected.color + '33', height: 20, fontSize: 12, maxWidth: '100%' }}
            />
          ) : (
            <em style={{ fontSize: 13 }}>Sem categoria</em>
          )
        }
        sx={{ fontSize: 13 }}
      >
        <MenuItem value=""><em style={{ fontSize: 13 }}>Sem categoria</em></MenuItem>
        {categories.map(cat => (
          <MenuItem key={cat.id} value={cat.id!} sx={{ fontSize: 13 }}>
            <Chip label={cat.name} size="small" sx={{ bgcolor: cat.color + '33', height: 20, fontSize: 12 }} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
