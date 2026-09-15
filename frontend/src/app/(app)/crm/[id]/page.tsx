import EditOppPage from "../new/page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return EditOppPage({ params });
}
