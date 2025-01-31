import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId } from 'mongodb';
import { config } from 'dotenv'; // this gets the .env file
import jwt from 'jsonwebtoken';
import { isToken } from 'typescript';
import { jwtDecode } from "jwt-decode";
import { describe } from 'node:test';
import { RChatData, User } from './interfaces';

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
  console.log(`Listening on http://localhost:${PORT}`); // Listening on http://localhost:3000
});

const io = new Server(httpServer, {
    cors: corsOptions
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

//Sockets
io.on('connection', (socket) => {
    console.log('A user connected');
})


//Routes
api.get('/api', (c) => {  
  return c.json({ message: 'Server connected' });
});

api.post('/api/signup', async (c) => {
  const { email, password, phone, fName, lName, isTutor } = await c.req.json();
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
    name: (fName + " " + lName),
    phone: phone,
    role: isTutor ? "tutor" : "student",
    chats: [],
    // the following is information which is later defined by the user
    description: "",
    languages: ["en"],
    state: "",
    GPA: 0.0,
    // tutor specific (leave blank for students)
    teaches: [], // all the classes this tutor teaches
    rating: 0.0,

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

  console.log("LOGIN SUCCESSFUL");

  return c.json({ message: "Login successful", token: token, email: email, _id: userEmail._id, role: userEmail.role ,exp:  "30 days"}, 200);
});

api.post("/api/chats", async (c) => {
    const header = c.req.header('Authorization').split(' ')[1];
    if (!verifyToken(header).valid) return c.json({message: "Unauthorized access"}, 401);

    const reqData = await c.req.json();

    const users = client.db('voluntorcluster').collection('user');
    const user: User = await users.findOne({ email: reqData.email });

    return c.json({chatIDs: user.chats });
})

api.post("/api/messages/:chatID", async (c) => {
    const header = c.req.header('Authorization').split(' ')[1];
    if (!verifyToken(header).valid) return c.json({message: "Unauthorized access"}, 401);
    
    const chatID = parseInt(c.req.param('chatID'));
    const messages = await client.db('voluntorcluster').collection('messages')
        .find({chatId: chatID})
        .project({_id:0, chatId:0})
        .toArray();

    return c.json({messages: messages});
})

api.post("/api/chats/send", async (c) => {
    const header = c.req.header('Authorization').split(' ')[1];
    if (!verifyToken(header).valid) return c.json({message: "Unauthorized access"}, 401);    

    const {chatID, content, user, createdAt} = await c.req.json();
    const messagesDB = client.db('voluntorcluster').collection('messages');
    const message = { chatId: chatID, content, user, createdAt };
    await messagesDB.insertOne(message).catch(err => {
        return c.json({ message: err });
    });
    console.log("Sent message");
    return c.json({message: "Success"}, 200);
})

api.post('/api/user/user-data', async (c) => {  // this is to give the user their data so they can modify it
  const { token } = await c.req.json();
  const database = client.db('voluntorcluster');
  const users = database.collection('user');

  
  const decoded: any = jwtDecode(token);
  const email = decoded.email;
  console.log("email: ", email );

  const userEmail = await users.findOne({ email: email });
  const validToken = await verifyToken(token);
  if (!validToken.valid) {
    return c.json({ message: "invalid token" }, 400);
  }

  
  return c.json({ 
    message: "Data fetched",
    name: userEmail.name,
    role: userEmail.role,
    description: userEmail.description,
    language: userEmail.language,
    state: userEmail.state,
    GPA: userEmail.GPA,
    teaches: userEmail.teaches
  }, 200);
});

api.post('/api/user/user-modify', async (c) => {  // user data is modifyed after settings changed
  const { token, name, role, description, language, state, GPA, teaches } = await c.req.json();
  const database = client.db('voluntorcluster');
  const users = database.collection('user');
  const decoded: any = jwtDecode(token);
  const email = decoded.email;
  console.log("email: ", email );
  const validToken = await verifyToken(token);
  if (!validToken.valid) {
    return c.json({ message: "invalid token" }, 400);
  }

  // if everything is OK then proceed!
  try{
    await users.updateOne(
      { email: email }, 
      { $set: { name: name, role: role, description: description, language: language, state: state, GPA: GPA, teaches: teaches } }
    );
  }
  catch(error){
    console.log(error)
  }
  
  return c.json({ 
    message: "Data updated"
  }, 200);
});

api.post('/api/search-tutor', async (c) => {  // this is to find tutors. Note that we always search for classes using lowercase ("math" not "Math")
  const { token, name, language, teaches } = await c.req.json();
  const database = client.db('voluntorcluster');
  
  const validToken = await verifyToken(token);
  if(!validToken.valid){return c.json({ message: "error" },400)} // invalid token

  let lang = language;
  if(lang == ""){lang = "en"}
  const users = await database.collection("user")
    .find({ role: "tutor", language: lang, teaches: teaches }) // Match role and language
    .project({_id:1,name:1,GPA:1,description:1,rating:1})
    .limit(10) // Limit to a maximum of 10 users
    .toArray(); // Convert to array

  return c.json(users);
})

api.post('/api/get-tutor', async (c) => {  // this is to find tutors. Note that we always search for classes using lowercase ("math" not "Math")
  const { _id } = await c.req.json();
  const database = client.db('voluntorcluster');
  console.log("ID: ", _id);
  const user = await database.collection("user").findOne(
    { _id: new ObjectId(_id), role: "tutor" }, // I know ObjectId is deprecated but I couldnt do well with the new one
    { projection: { _id: 1, name: 1, GPA: 1, description: 1, rating: 1 } } // Projection
  );

  console.log(user);
  
  return c.json(user);
})