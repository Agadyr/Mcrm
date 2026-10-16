import { ListSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return <ListSkeleton actions={2} filters={6} columns={6} />
}
