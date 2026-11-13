import { CompassRose } from '@/components/CompassRose'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/theme/ThemeToggle'

type Props = { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }

export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div className="flex items-center justify-center">
          <CompassRose className="max-w-[440px]" />
        </div>
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug">Saiba para onde vai cada real.</p>
          <p className="mt-2 text-muted-foreground">
            Contas, cartões e orçamento no mesmo painel, com o mês inteiro à vista.
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  )
}
