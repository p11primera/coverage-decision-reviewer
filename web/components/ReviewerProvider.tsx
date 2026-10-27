// WHY this is a client component: CopilotKit's provider owns React context (the agent
// registry, runtime connection state, interrupt surfacing) which only exists in the
// browser — the server has no long-lived connection to keep. WHY the boundary sits here:
// this is the single thinnest client wrapper that can hold the shared context all the
// interactive islands (form, stream, state panel, progress, approval) need; page.tsx stays
// a Server Component shell and every island below remains independently code-splittable.

"use client";

import { type ReactNode } from "react";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";

export function ReviewerProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId="reviewer"
      enableInspector={false}
    >
      {children}
    </CopilotKitProvider>
  );
}
