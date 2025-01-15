const { serve } = require('@hono/node-server');
const { Hono } = require('hono');
const { cors } = require('hono/cors');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const { MongoClient } = require("mongodb");
require('dotenv').config() // this gets the .env file

// setup mongodb
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);


const api = new Hono()


// server is 3001 and the client is 3000


// Explain to me later how this works,      
const httpServer = serve({
  fetch: api.fetch,
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



// function to hash passwords
async function hash(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}




api.use( // allowing this address to send requests to our server
  '/*',
  cors({
    origin: ['http://localhost:3000'],
  })
);

api.get('/api', (c) => {  
  return c.json({ message: 'Server connected' });
});



api.post('/api/signup', async (c) => {
  const { email, password } = await c.req.json();
  const database = client.db('voluntorcluster');
  const users = database.collection('user');

  const exists = await users.findOne({ email: email });
  if (exists) {
    return c.json({ message: "User already exists" }, 400);
  }

  const pass = await hash(password);
  
  const newUser = {
    email,
    password: pass, // Store hashed password
    createdAt: new Date(),
  };

  await users.insertOne(newUser);

  return c.json({ message: "Signup successful" }, 201); 
});


api.post('/api/signin', async (c) => {
  const { email, password } = await c.req.json();
  const database = client.db('voluntorcluster');
  const users = database.collection('user');

  //typechecks for bcript
  
  const userEmail = await users.findOne({ email: email });
  if (!userEmail) {
    console.error("INCORRECT EMAIL");
    return c.json({ message: "Incorrect email" }, 400); 
  }
  
  if (typeof userEmail.password !== 'string' || typeof password !== 'string') {
    console.log(typeof userEmail.password)
    console.log(typeof password)
    return c.json({ message: "Email and password must be strings." }, 400);
  }
  const isPasswordValid = await bcrypt.compare(password, userEmail.password);
  if (!isPasswordValid) {
    console.error("INCORRECT PASSWORD");
    return c.json({ message: "Incorrect password" }, 400); 
  }

  console.log("EMAIL AND PASSWORD CORRECT");
  return c.json({ message: "Login successful" }, 200);
});