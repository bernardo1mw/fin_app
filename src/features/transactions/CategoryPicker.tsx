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
            <Box
              sx={{
                bgcolor: selected.color + '33',
                borderRadius: 1,
                px: 0.75,
                fontSize: 13,
                display: 'inline-block',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selected.name}
            </Box>
          ) : (
            <em style={{ fontSize: 13 }}>Sem categoria</em>
          )
        }
        sx={{ fontSize: 13 }}
      >
        <MenuItem value=""><em style={{ fontSize: 13 }}>Sem categoria</em></MenuItem>
        {categories.map(cat => (
          <MenuItem
            key={cat.id}
            value={cat.id!}
            sx={{
              fontSize: 13,
              bgcolor: cat.color + '22',
              '&:hover': { bgcolor: cat.color + '44' },
              '&.Mui-selected': { bgcolor: cat.color + '55' },
              '&.Mui-selected:hover': { bgcolor: cat.color + '66' },
            }}
          >
            {cat.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
