async function main() {
  console.log('Triggering cleanup via internal API...')
  const res = await fetch('http://127.0.0.1:3000/api/youtube/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelDbId: 'cmrtrthiq0005u7hjxgawx3r3' })
  })
  const text = await res.text()
  console.log('API Response:', res.status, text)
}

main()
