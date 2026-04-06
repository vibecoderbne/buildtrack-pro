import Link from 'next/link'
import { signup } from '@/app/actions/auth'
import AuthForm from '@/app/(auth)/AuthForm'

export default function SignupPage() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ProgressBuild</h1>
        <p className="mt-2 text-gray-600">Create your account</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <AuthForm action={signup} submitLabel="Create account" showName />

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
