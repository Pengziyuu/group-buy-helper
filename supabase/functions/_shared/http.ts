export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function readJsonBodyWithLimit(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('請求內容過大')

  const reader = request.body?.getReader()
  if (!reader) return {}
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('請求內容過大')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(body))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON格式錯誤')
  return parsed as Record<string, unknown>
}

export function clientAddress(request: Request): string {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!address || address.length > 64) throw new Error('無法識別請求來源')
  return address
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
