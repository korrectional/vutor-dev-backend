import { serve } from '@hono/node-server'
import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { Server } from 'socket.io'


const app = new Hono();
const httpServer = serve({
    fetch: app.fetch,
    port: 3000
}, (info) => {
    console.log('Listening on http://localhost:3000') // Listening on http://localhost:3000
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
    origin: ['http://localhost:3000'],
  })
);


app.get('/api', (c) => {
  return c.json({ message: 'Server connected' });
});

app.get ('/', (c) => {
    console.log('Hello World');
    return c.html('<h1> Hello World </h1>');
})