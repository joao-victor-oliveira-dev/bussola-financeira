export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      <p className="mt-6 rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
        Esta área está em construção e chega nas próximas fases do projeto.
      </p>
    </div>
  )
}
