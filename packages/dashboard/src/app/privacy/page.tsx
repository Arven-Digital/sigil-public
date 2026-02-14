import MarkdownPage from "@/components/MarkdownPage";

export const metadata = {
  title: "Privacy Policy — Sigil Protocol",
  description: "How Sigil Protocol handles your data.",
};

export default function PrivacyPage() {
  return <MarkdownPage file="/privacy.md" title="Privacy Policy" />;
}
