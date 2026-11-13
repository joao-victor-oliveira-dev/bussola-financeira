import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useCategoriesList } from '@/api/generated/categories/categories'
import type { CategoryOut, CategoryOutKind, TagOut } from '@/api/generated/model'
import { useTagsList } from '@/api/generated/tags/tags'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryFormDialog, type CategoryDialogState } from '@/pages/categories/CategoryFormDialog'
import { TagFormDialog } from '@/pages/categories/TagFormDialog'

type Tab = CategoryOutKind | 'tags'

const Dot = ({ color }: { color: string }) => (
  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
)

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategoriesList()
  const { data: tags = [] } = useTagsList()
  const [tab, setTab] = useState<Tab>('expense')
  const [catDialog, setCatDialog] = useState<CategoryDialogState>({
    open: false,
    category: null,
    kind: 'expense',
    parentId: null,
  })
  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag: TagOut | null }>({
    open: false,
    tag: null,
  })

  const openCategory = (
    kind: CategoryOutKind,
    category: CategoryOut | null,
    parentId = null as number | null,
  ) => setCatDialog({ open: true, kind, category, parentId: category?.parent_id ?? parentId })
  const openTag = (tag: TagOut | null) => setTagDialog({ open: true, tag })

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Categorias"
        description="Organize seus lançamentos por categoria e marque-os com tags."
        actions={
          <Button
            className="h-10 rounded-[10px] px-4"
            onClick={() => (tab === 'tags' ? openTag(null) : openCategory(tab, null))}
          >
            <Plus aria-hidden="true" />
            {tab === 'tags' ? 'Nova tag' : 'Nova categoria'}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="expense">Despesas</TabsTrigger>
          <TabsTrigger value="income">Receitas</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        {(['expense', 'income'] as const).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-4">
            {isLoading ? (
              <Skeleton className="h-64 rounded-2xl" />
            ) : (
              <CategoryTree
                categories={categories.filter((c) => c.kind === kind)}
                onEdit={(c) => openCategory(kind, c)}
                onAddChild={(parent) => openCategory(kind, null, parent.id)}
              />
            )}
          </TabsContent>
        ))}

        <TabsContent value="tags" className="mt-4">
          {tags.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
              Tags marcam lançamentos de categorias diferentes, como “viagem” ou “casa nova”.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-label={`Editar ${t.name}`}
                    onClick={() => openTag(t)}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Dot color={t.color} />
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        state={catDialog}
        categories={categories}
        onOpenChange={(open) => setCatDialog((s) => ({ ...s, open }))}
      />
      <TagFormDialog
        open={tagDialog.open}
        tag={tagDialog.tag}
        onOpenChange={(open) => setTagDialog((s) => ({ ...s, open }))}
      />
    </div>
  )
}

function CategoryTree({
  categories,
  onEdit,
  onAddChild,
}: {
  categories: CategoryOut[]
  onEdit: (c: CategoryOut) => void
  onAddChild: (parent: CategoryOut) => void
}) {
  const roots = categories.filter((c) => c.parent_id === null)
  if (roots.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
        Nenhuma categoria aqui ainda.
      </p>
    )
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {roots.map((root) => {
        const children = categories.filter((c) => c.parent_id === root.id)
        return (
          <li key={root.id} className="px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Editar ${root.name}`}
                onClick={() => onEdit(root)}
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Dot color={root.color} />
                {root.name}
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Nova subcategoria em ${root.name}`}
                title="Nova subcategoria"
                onClick={() => onAddChild(root)}
                className="text-muted-foreground"
              >
                <Plus />
              </Button>
            </div>
            {children.length > 0 && (
              <ul className="mb-1 ml-[1.15rem] border-l border-border pl-3">
                {children.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      aria-label={`Editar ${child.name}`}
                      onClick={() => onEdit(child)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Dot color={child.color} />
                      {child.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
