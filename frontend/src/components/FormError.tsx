export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-[10px] border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
    >
      {message}
    </p>
  )
}
