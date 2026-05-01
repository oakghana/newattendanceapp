import { NextRequest } from "next/server"
import { POST as approvePost } from "../hr-approve/route"

// Legacy compatibility route.
// Keep old endpoint working by mapping legacy payload to the new hr-approve contract.
export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}))

  const mapped = {
    ...payload,
    note: payload?.note ?? payload?.hr_response_letter ?? null,
  }

  const forwarded = new NextRequest(request.url.replace("/hr-finalize", "/hr-approve"), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(mapped),
  })

  return approvePost(forwarded)
}
