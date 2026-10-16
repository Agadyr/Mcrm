import { ListSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return <ListSkeleton actions={1} filters={4} columns={6} />
}
