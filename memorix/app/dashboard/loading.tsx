export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white animate-pulse">
      <header className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <div className="h-7 w-24 bg-[#1E293B] rounded-lg" />
        <div className="h-6 w-20 bg-[#1E293B] rounded-lg" />
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="h-9 w-56 bg-[#1E293B] rounded-lg mb-2" />
          <div className="h-5 w-72 bg-[#1E293B] rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-[#1E293B] rounded-2xl p-5 border border-[#334155] h-20" />
          ))}
        </div>
        <div className="h-28 bg-[#1E293B] rounded-2xl mb-8 border border-[#334155]" />
        <div className="h-6 w-44 bg-[#1E293B] rounded-lg mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-[#1E293B] rounded-2xl p-6 border border-[#334155] h-28" />
          ))}
        </div>
      </main>
    </div>
  )
}
