import { ListSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return <ListSkeleton actions={2} filters={5} columns={6} />
}
