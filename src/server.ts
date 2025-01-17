import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb';
import { config } from 'dotenv'; // this gets the .env file
import jwt from 'jsonwebtoken';
import { isToken } from 'typescript';

config()

// setup mongodb
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// setup jwt
const SECRET_KEY = process.env.JWT_SECRET

// setup hobo
const api = new Hono()
const PORT = 3000;
const corsOptions = {
    origin: ["http://localhost:5173"],
};

//Runs the Server
api.use("/api/*", cors(corsOptions));

const httpServer = serve({
  fetch: api.fetch,
  port: PORT
}, (info) => {
  console.log(`Listening on http://localhost:${PORT}`); // Listening on http://localhost:3001
});

//Functions
async function hashPwd(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); 
    return { valid: true, decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}


//Routes
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

  const pass = await hashPwd(password);
  
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

  // everything is good so we create the JWT token
  const token = jwt.sign(
    { email: email, id: userEmail._id },
    SECRET_KEY,
    { expiresIn: "30 days" }
  )
  console.log(token);


  console.log("EMAIL AND PASSWORD CORRECT");
  return c.json({ message: "Login successful", token: token, email: email, exp:  "30 days"}, 200);
});

api.post('api/verify-session', async (c) => {
  const { token } = await c.req.json();

  const validToken = await verifyToken(token).valid;
  console.log("Token valid: " + validToken)
  return c.json({ valid: validToken })
})