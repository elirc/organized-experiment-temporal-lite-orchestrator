import { RunDetail } from "@/components/runs/run-detail";

type Props = {
  params: Promise<{ runId: string }>;
};

export default async function RunDetailPage({ params }: Props) {
  const { runId } = await params;

  return <RunDetail runId={runId} />;
}
