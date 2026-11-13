import { z } from 'zod'

const email = z.string().trim().email('Informe um e-mail válido.')
const password = z.string().min(8, 'A senha deve ter ao menos 8 caracteres.')

export const loginSchema = z.object({ email, password })
export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(150),
  email,
  password,
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
