import { PageTitle, Panel } from '@/components/kit';

export default function Copilot() {
  return (
    <div>
      <PageTitle title="Copilot" />
      <Panel><p className="text-sm text-slate-600">The grounded Copilot (tool-calling analyst with draft-and-confirm actions) ships in the next session (M8). The dashboard, workflow and audit trail work without it.</p></Panel>
    </div>
  );
}
