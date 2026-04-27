export default function DecksLoading() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white animate-pulse">
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 border-b border-[#334155] px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 bg-[#1E293B] rounded" />
          <div className="h-6 w-36 bg-[#1E293B] rounded-lg flex-1" />
          <div className="w-9 h-9 bg-[#1E293B] rounded-xl" />
        </div>
        <div className="h-10 bg-[#1E293B] rounded-xl" />
      </header>
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <div className="h-8 bg-[#1E293B] rounded-lg mb-2 w-32" />
            <div className="space-y-2 pl-4">
              {[0, 1].map(j => (
                <div key={j} className="h-14 bg-[#1E293B] rounded-xl border border-[#1E293B]" />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
