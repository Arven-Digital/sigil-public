const colors = {
  approved: "bg-[#00FF88]/20 text-[#00FF88] border-[#00FF88]/30",
  rejected: "bg-[#F04452]/20 text-[#F04452] border-[#F04452]/30",
  pending: "bg-[#F4A524]/20 text-[#F4A524] border-[#F4A524]/30",
};

export default function VerdictBadge({ verdict }: { verdict: "approved" | "rejected" | "pending" }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[verdict]}`}>
      {verdict}
    </span>
  );
}
