const colors = {
  approved: "bg-[#00FF88]/20 text-[#00FF88] border-[#00FF88]/30",
  rejected: "bg-sigil-error/20 text-sigil-error border-sigil-error/30",
  pending: "bg-sigil-warning/20 text-sigil-warning border-sigil-warning/30",
};

export default function VerdictBadge({ verdict }: { verdict: "approved" | "rejected" | "pending" }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[verdict]}`}>
      {verdict}
    </span>
  );
}
