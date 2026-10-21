import { Link } from 'react-router-dom'

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-zinc-950 px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-white">Village Tuk-Tuks</h1>
        <p className="mt-1 text-sm text-zinc-400">Ad platform</p>
      </div>

      <Link
        to="/player"
        className="rounded-2xl bg-purple-500 px-10 py-6 text-xl font-semibold text-white hover:bg-purple-400"
      >
        🚖 Sign in as Tuk-Tuk Driver
      </Link>

      <div className="flex gap-6 text-sm text-zinc-500">
        <Link to="/sales/login" className="hover:text-zinc-300 hover:underline">
          Sales team sign in
        </Link>
        <Link to="/admin/login" className="hover:text-zinc-300 hover:underline">
          Management sign in
        </Link>
      </div>
    </div>
  )
}
