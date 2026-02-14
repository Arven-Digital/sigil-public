"use client";

import dynamic from "next/dynamic";

const OnboardingFlow = dynamic(() => import("./OnboardingFlow"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  ),
});

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
