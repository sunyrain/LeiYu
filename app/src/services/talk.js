export async function sendTalkChat(messages) {
  const response = await fetch('/api/talk-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: Array.isArray(messages) ? messages : [],
    }),
  })

  if (!response.ok) {
    const error = await safeJson(response)
    throw new Error(error.message || `Talk API error: ${response.status}`)
  }

  return response.json()
}

export async function generateFrontPoemBlocks(userContext = {}) {
  const response = await fetch('/api/generate-front-poem-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userContext),
  })

  if (!response.ok) {
    const error = await safeJson(response)
    throw new Error(error.message || `Poem block API error: ${response.status}`)
  }

  return response.json()
}

export async function extractEntryProfile(messages) {
  const response = await fetch('/api/extract-entry-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: Array.isArray(messages) ? messages : [],
    }),
  })

  if (!response.ok) {
    const error = await safeJson(response)
    throw new Error(error.message || `Entry profile API error: ${response.status}`)
  }

  return response.json()
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}
