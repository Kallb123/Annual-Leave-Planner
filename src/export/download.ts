/** Triggers a browser download of a canvas as a PNG file. */
export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not encode PNG')

  downloadBlob(blob, filename)
}

/** Triggers a browser download of a JSON string. */
export function downloadJson(json: string, filename: string) {
  downloadBlob(new Blob([json], { type: 'application/json' }), filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
