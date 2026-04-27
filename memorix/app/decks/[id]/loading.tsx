export default function DeckLoading() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white px-6 py-10 animate-pulse">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="h-5 w-20 bg-[#1E293B] rounded" />
          <div className="h-5 w-32 bg-[#1E293B] rounded" />
        </div>
        <div className="bg-[#1E293B] rounded-2xl p-8 border border-[#334155] mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-[#0F172A] rounded-full" />
            <div className="h-7 w-48 bg-[#0F172A] rounded-lg" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-[#0F172A] rounded-xl p-4 h-16" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[#1E293B] rounded-xl p-5 border border-[#1E293B] h-20" />
          ))}
        </div>
      </div>
    </div>
  )
}
