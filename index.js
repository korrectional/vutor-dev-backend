const { serve } = require('@hono/node-server')
const { Hono } = require('hono')

const app = new Hono()
app.get('/api', (c) => c.text('Hono meets Node.js'))

serve(app, (info) => {
  console.log('Listening on http://localhost:3000') // Listening on http://localhost:3000
})
