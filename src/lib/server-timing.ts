type ServerTimingMetric = {
  name: string
  durationMs: number
  description?: string
}

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-')
}

function sanitizeDescription(value: string): string {
  return value
    .replace(/["\\]/g, "")
    .replace(/[^\x20-\x7E]+/g, "-")
    .trim()
}

export function createServerTiming() {
  const metrics: ServerTimingMetric[] = []

  function start() {
    return performance.now()
  }

  function end(name: string, startedAt: number, description?: string) {
    metrics.push({
      name: sanitizeToken(name),
      durationMs: Math.max(0, performance.now() - startedAt),
      description,
    })
  }

  function measure<T>(name: string, fn: () => T, description?: string): T {
    const startedAt = start()
    try {
      return fn()
    } finally {
      end(name, startedAt, description)
    }
  }

  async function measureAsync<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> {
    const startedAt = start()
    try {
      return await fn()
    } finally {
      end(name, startedAt, description)
    }
  }

  function headerValue() {
    return metrics
      .map((metric) => {
        const parts = [`${metric.name};dur=${metric.durationMs.toFixed(1)}`]
        if (metric.description) {
          parts.push(`desc="${sanitizeDescription(metric.description)}"`)
        }
        return parts.join(';')
      })
      .join(', ')
  }

  function apply(headers: Headers) {
    const value = headerValue()
    if (!value) return
    headers.set('Server-Timing', value)
    headers.set('X-Scout-Timing', value)
    headers.set('Timing-Allow-Origin', '*')

    const existingExpose = headers.get('Access-Control-Expose-Headers')
    const exposeValues = new Set(
      (existingExpose ? existingExpose.split(',') : [])
        .map((value) => value.trim())
        .filter(Boolean)
    )
    exposeValues.add('Server-Timing')
    exposeValues.add('X-Scout-Timing')
    headers.set('Access-Control-Expose-Headers', Array.from(exposeValues).join(', '))
  }

  return {
    start,
    end,
    measure,
    measureAsync,
    apply,
    headerValue,
  }
}
