const { serve } = require('@hono/node-server')
const { Hono } = require('hono')

const app = new Hono()
app.get('/api', (c) => {
  return c.json({ message: 'Server connected' })
})

serve(app, (info) => {
  console.log('Listening on http://localhost:3000') // Listening on http://localhost:3000
})
