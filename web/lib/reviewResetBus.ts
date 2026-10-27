// Tiny browser-side pub/sub that announces "the reviewer started over via New review" to
// every island holding LOCAL run buffers — ProgressBar (last CUSTOM progress) and
// ApprovalCard (tool-activity chip map keyed by toolCallId). Those buffers only clear on
// the next onRunStartedEvent today, so the finished run's chips/bar stayed visible after
// "New review" until a new submit replaced them.
//
// WHY a module singleton (same shape as lib/cancelBus): the reset is initiated in
// RequestForm.newReview(), which additionally wipes the SHARED agent buffers directly
// (agent.setMessages([]) clears the narrative + StatePanel request, agent.setState({})
// clears the risk/recommendation snapshot, agent.threadId = newId() prevents the next
// submit from appending to the finished thread — backend history is keyed per threadId).
// Module scope is per browser tab, which is exactly the blast radius; nothing crosses the
// server boundary.

type ResetListener = () => void;

const listeners = new Set<ResetListener>();

export function publishReviewReset(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeReviewReset(listener: ResetListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
