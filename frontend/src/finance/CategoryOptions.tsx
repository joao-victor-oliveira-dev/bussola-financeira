import type { CategoryOut } from '@/api/generated/model'

/** <option>s de categoria: principais e, logo abaixo, as subcategorias recuadas. */
export function CategoryOptions({ categories }: { categories: CategoryOut[] }) {
  const roots = categories.filter((c) => c.parent_id === null)
  return roots.flatMap((root) => [
    <option key={root.id} value={root.id}>
      {root.name}
    </option>,
    ...categories
      .filter((c) => c.parent_id === root.id)
      .map((child) => (
        <option key={child.id} value={child.id}>
          {'    '}
          {child.name}
        </option>
      )),
  ])
}
