import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { useAuthDemo, useAuthLogin } from '@/api/generated/auth/auth'
import { ApiError, ensureCsrf } from '@/api/http'
import { useAuth } from '@/auth/useAuth'
import { FormError } from '@/components/FormError'
import { FormField } from '@/components/FormField'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/pages/AuthLayout'
import { loginSchema, type LoginValues } from '@/pages/authSchemas'

export function LoginPage() {
  const { setUser } = useAuth()
  const login = useAuthLogin<ApiError>()
  const demo = useAuthDemo<ApiError>()
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    await ensureCsrf()
    const user = await login.mutateAsync({ data: values }).catch(() => null)
    if (user) setUser(user)
  })

  const onDemo = async () => {
    await ensureCsrf()
    const user = await demo.mutateAsync().catch(() => null)
    if (user) setUser(user)
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acompanhe suas contas e veja o mês com clareza."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormField
          label="E-mail"
          type="email"
          autoComplete="email"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <FormField
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <FormError message={login.error?.detail} />
        <SubmitButton loading={login.isPending}>Entrar</SubmitButton>
      </form>
      <div className="mt-6 grid gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onDemo}
          disabled={demo.isPending}
          className="h-11 rounded-[10px] text-[0.95rem]"
        >
          Entrar como visitante
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Explore o app com 12 meses de dados de exemplo, sem cadastro.
        </p>
        <FormError message={demo.error?.detail} />
      </div>
    </AuthLayout>
  )
}
