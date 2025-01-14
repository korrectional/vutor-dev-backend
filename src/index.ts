const { serve } = require('@hono/node-server');
const { Hono } = require('hono');
const { cors } = require('hono/cors');
const { Server } = require('socket.io');

const app = new Hono()


// Explain to me later how this works, btw I changed the adresses so that the server is 3001 and the client is 3000
const httpServer = serve({
  fetch: app.fetch,
  port: 3001
}, (info) => {
  console.log('Listening on http://localhost:3001') // Listening on http://localhost:3001
});

const io = new Server(httpServer, {
  cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"]
  }
});



app.use( // allowing this address to send requests to our server
  '/*',
  cors({
    origin: ['http://localhost:3001'],
  })
);


app.get('/api', (c) => {  
  return c.json({ message: 'Server connected' });
});

// I removed hello world because for tests we can just use /api
