import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2, Plus, RotateCcw } from 'lucide-react'
import type { SelectChangeEvent } from '@mui/material/Select'
import { db } from '@/db/db'
import { reseedCategories } from '@/db/seeds'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import type { Category } from '@/db/schema'

const TYPE_LABELS = { income: 'Renda', expense: 'Despesa', transfer: 'Transferência' }

export function CategoryManager() {
  const categories = useLiveQuery(() => db.categories.toArray())
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete(id: string) {
    await db.categories.delete(id)
  }

  async function handleReseed() {
    await reseedCategories()
    setConfirming(false)
  }

  return (
    <Box sx={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Categorias</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} onClick={() => setConfirming(true)}>
            Restaurar padrão
          </Button>
          <Button size="small" variant="contained" startIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nova categoria
          </Button>
        </Box>
      </Box>

      <Card>
        {(categories ?? []).map((cat, i) => (
          <Box key={cat.id}>
            {i > 0 && <Divider />}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: cat.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{cat.name}</Typography>
                <Chip label={TYPE_LABELS[cat.type]} size="small" variant="outlined" sx={{ fontSize: 11 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton size="small" onClick={() => setEditing(cat)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(cat.id!)}>
                  <Trash2 size={14} />
                </IconButton>
              </Box>
            </Box>
          </Box>
        ))}
      </Card>

      <CategoryDialog
        key={editing?.id ?? (creating ? 'new' : 'closed')}
        open={creating || editing !== null}
        initial={editing}
        onClose={() => { setEditing(null); setCreating(false) }}
      />

      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Restaurar categorias padrão?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Isso vai apagar todas as categorias e regras atuais e restaurar as categorias padrão.
            As transações perderão suas categorizações.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleReseed}>Restaurar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function CategoryDialog({ open, initial, onClose }: {
  open: boolean
  initial: Category | null
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<Category['type']>(initial?.type ?? 'expense')
  const [color, setColor] = useState(initial?.color ?? '#94a3b8')

  async function handleSave() {
    if (!name.trim()) return
    if (initial?.id) {
      await db.categories.update(initial.id, { name: name.trim(), type, color })
    } else {
      await db.categories.add({ name: name.trim(), type, color, icon: 'circle-dot' })
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          label="Nome"
          size="small"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Alimentação"
          autoFocus
        />
        <FormControl size="small" fullWidth>
          <InputLabel>Tipo</InputLabel>
          <Select
            label="Tipo"
            value={type}
            onChange={(e: SelectChangeEvent) => setType(e.target.value as Category['type'])}
          >
            <MenuItem value="expense">Despesa</MenuItem>
            <MenuItem value="income">Renda</MenuItem>
            <MenuItem value="transfer">Transferência</MenuItem>
          </Select>
        </FormControl>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Cor</Typography>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #e0e0e0', cursor: 'pointer', padding: 2 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave}>Salvar</Button>
      </DialogActions>
    </Dialog>
  )
}
