import { PageTitle } from '@/components/kit';
import { Suspense } from 'react';
import { ChatView } from '@/components/copilot/ChatView';

export default function Copilot() {
  return (
    <div>
      <PageTitle title="Copilot" sub="Grounded analyst: every figure comes from a tool call on the live dataset revision; actions are drafts you confirm." />
      <div className="h-[calc(100vh-150px)] max-w-3xl rounded-lg border"><Suspense><ChatView /></Suspense></div>
    </div>
  );
}
