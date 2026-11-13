import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { useAuthLogin } from '@/api/generated/auth/auth'
import { ApiError, ensureCsrf } from '@/api/http'
import { useAuth } from '@/auth/useAuth'
import { FormError } from '@/components/FormError'
import { FormField } from '@/components/FormField'
import { SubmitButton } from '@/components/SubmitButton'
import { AuthLayout } from '@/pages/AuthLayout'
import { loginSchema, type LoginValues } from '@/pages/authSchemas'

export function LoginPage() {
  const { setUser } = useAuth()
  const login = useAuthLogin<ApiError>()
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    await ensureCsrf()
    const user = await login.mutateAsync({ data: values }).catch(() => null)
    if (user) setUser(user)
  })

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
    </AuthLayout>
  )
}
