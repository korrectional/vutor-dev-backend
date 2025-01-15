import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Server } from 'socket.io';

const app = new Hono();
const PORT = 3000;
const corsOptions = {
    origin: ["http://localhost:5173"],
};

//Runs the Server
app.use("/api/*", cors(corsOptions));

const httpServer = serve({
  fetch: app.fetch,
  port: PORT
}, (info) => {
  console.log(`Listening on http://localhost:${PORT}`); // Listening on http://localhost:3001
});


//Routes
app.get('/api', (c) => {  
  return c.json({ message: 'Server connected' });
});
