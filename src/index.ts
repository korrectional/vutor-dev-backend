const { serve } = require('@hono/node-server')
const { Hono } = require('hono')
const { cors } = require('hono/cors')

const app = new Hono()

app.use( // allowing this adress to send requests to our server
  '/*',
  cors({
    origin: ['http://localhost:5173'],
  })
)


app.get('/api', (c) => {
  return c.json({ message: 'Server connected' })
})

serve(app, (info) => {
  console.log('Listening on http://localhost:3000') // Listening on http://localhost:3000
})
