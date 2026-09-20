export function StatusScreen({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500">{sub}</p>
      </div>
    </div>
  );
}
