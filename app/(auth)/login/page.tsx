import Link from 'next/link'
import { login } from '@/app/actions/auth'
import AuthForm from '@/app/(auth)/AuthForm'
import { Wordmark } from '@/components/brand/Logo'

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <Wordmark size={28} weight={600} />
        </div>
        <p className="mt-2" style={{ color: 'var(--ink-3)' }}>Sign in to your account</p>
      </div>

      <div className="rounded-xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <AuthForm action={login} submitLabel="Sign in" />

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium" style={{ color: 'var(--accent)' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
