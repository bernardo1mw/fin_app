import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2, Plus, RotateCcw } from 'lucide-react'
import { db } from '@/db/db'
import { reseedCategories } from '@/db/seeds'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Category } from '@/db/schema'

const TYPE_LABELS = { income: 'Renda', expense: 'Despesa', transfer: 'Transferência' }

export function CategoryManager() {
  const categories = useLiveQuery(() => db.categories.toArray())
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete(id: number) {
    await db.categories.delete(id)
  }

  async function handleReseed() {
    await reseedCategories()
    setConfirming(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Categorias</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <RotateCcw className="size-4 mr-1" /> Restaurar padrão
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> Nova categoria
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {(categories ?? []).map((cat: Category) => (
            <div key={cat.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full shrink-0" style={{ background: cat.color }} />
                <span className="font-medium text-sm">{cat.name}</span>
                <Badge variant="outline" className="text-xs">{TYPE_LABELS[cat.type]}</Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(cat)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(cat.id!)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CategoryDialog
        key={editing?.id ?? (creating ? 'new' : null)}
        open={creating || editing !== null}
        initial={editing}
        onClose={() => { setEditing(null); setCreating(false) }}
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar categorias padrão?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso vai apagar todas as categorias e regras atuais e restaurar as categorias padrão.
            As transações perderão suas categorizações.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReseed}>Restaurar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alimentação" />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={v => setType(v as Category['type'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="income">Renda</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cor</Label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-full rounded-md border cursor-pointer" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
