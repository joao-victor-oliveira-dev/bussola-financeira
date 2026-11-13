import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { useAuthRegister } from '@/api/generated/auth/auth'
import { ApiError, ensureCsrf } from '@/api/http'
import { useAuth } from '@/auth/useAuth'
import { FormError } from '@/components/FormError'
import { FormField } from '@/components/FormField'
import { SubmitButton } from '@/components/SubmitButton'
import { AuthLayout } from '@/pages/AuthLayout'
import { registerSchema, type RegisterValues } from '@/pages/authSchemas'

export function RegisterPage() {
  const { setUser } = useAuth()
  const signup = useAuthRegister<ApiError>()
  const { register, handleSubmit, formState } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    await ensureCsrf()
    const user = await signup.mutateAsync({ data: values }).catch(() => null)
    if (user) setUser(user)
  })

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Leva menos de um minuto. Seus dados ficam só com você."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormField
          label="Nome"
          autoComplete="name"
          error={formState.errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <FormError message={signup.error?.detail} />
        <SubmitButton loading={signup.isPending}>Criar conta</SubmitButton>
      </form>
    </AuthLayout>
  )
}
