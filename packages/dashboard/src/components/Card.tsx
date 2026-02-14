export default function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-5 ${className}`}>
      {title && <h3 className="text-sm font-medium text-white/40 mb-3">{title}</h3>}
      {children}
    </div>
  );
}
