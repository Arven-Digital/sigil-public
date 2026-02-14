import MarkdownPage from "@/components/MarkdownPage";

export const metadata = {
  title: "Terms of Use — Sigil Protocol",
  description: "Terms and conditions for using Sigil Protocol.",
};

export default function TermsPage() {
  return <MarkdownPage file="/terms.md" title="Terms of Use" />;
}
