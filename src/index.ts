const { serve } = require('@hono/node-server')
const { Hono } = require('hono')
const { cors } = require('hono/cors')
const fs = require('fs')
const app = new Hono()

app.use( // allowing this adress to send requests to our server
  '/*',
  cors({
    origin: ['http://localhost:5173','https://143e-75-52-101-39.ngrok-free.app','http://localhost:3000'],
  })
)


app.get('/api', (c) => {
  return c.json({ message: 'Server connected' })
})

app.post('/api/signin', async (c) => {
  return c.json({ message: 'Server connected' })
})


serve({
  fetch: app.fetch,
  port: 3001,
},
() => {
  console.log("Listening on http://localhost:3001")
})