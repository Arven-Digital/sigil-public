export type Transaction = {
  id: string;
  target: string;
  value: string;
  function: string;
  verdict: "approved" | "rejected" | "pending";
  riskScore: number;
  timestamp: string;
  layers?: {
    layer1: { pass: boolean; reason: string };
    layer2: { pass: boolean; reason: string };
    layer3: { pass: boolean; score: number; reason: string };
  };
};
