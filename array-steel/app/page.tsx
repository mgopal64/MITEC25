export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-black dark:via-zinc-950 dark:to-black">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-zinc-200/30 blur-3xl dark:bg-zinc-800/20"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-zinc-200/30 blur-3xl dark:bg-zinc-800/20"></div>
      </div>

      {/* Main Content */}
      <main className="relative flex min-h-screen items-center justify-center px-4 py-20">
        <div className="w-full max-w-3xl text-center">
          {/* Icon or decorative element */}
          <div className="mb-8 flex justify-center">
            <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 p-4 shadow-xl dark:from-zinc-100 dark:to-zinc-300">
              <svg
                className="h-12 w-12 text-white dark:text-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight text-black dark:text-white md:text-6xl lg:text-7xl">
            Calculate My Steel
          </h1>
          <p className="mb-10 text-xl leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-2xl">
            Get accurate steel calculations for your project
          </p>
          
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 px-10 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl dark:from-zinc-100 dark:to-zinc-200 dark:text-black">
              <span className="relative z-10">Calculate Now</span>
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 to-zinc-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-zinc-200 dark:to-zinc-300"></div>
            </button>
            <button className="rounded-xl border-2 border-zinc-300 bg-white/50 px-10 py-4 text-lg font-semibold text-zinc-700 backdrop-blur-sm transition-all duration-300 hover:border-zinc-400 hover:bg-white/80 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/80">
              Learn More
            </button>
          </div>

          {/* Subtle decorative line */}
          <div className="mt-16 flex items-center justify-center gap-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-zinc-300 dark:to-zinc-700"></div>
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600"></div>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-zinc-300 dark:to-zinc-700"></div>
          </div>
        </div>
      </main>
    </div>
  );
}
