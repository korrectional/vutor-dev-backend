import { serve } from "@hono/node-server";
import { createServer } from "http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import { Int32, MongoClient, ObjectId } from "mongodb";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import { isToken } from "typescript";
import { jwtDecode } from "jwt-decode";
import { ChatMessageData, RChatData, User } from './interfaces';
import { createNodeWebSocket } from '@hono/node-ws';
import { profanity, CensorType } from '@2toad/profanity';

config();

// setup mongodb
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let activeUsers = new Set();
let chatRooms = new Map<string, string>();

// setup jwt
const SECRET_KEY = process.env.JWT_SECRET;

// setup hono
const app = new Hono();
//const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const PORT = 3000;
const corsOptions = {
    origin: ["http://localhost:5173"],
};

//Runs the Server
app.use("/api/*", cors(corsOptions));

const server = serve(
    {
        fetch: app.fetch,
        port: PORT,
    },
    (info) => {
        console.log(`Listening on http://localhost:${PORT}`); // Listening on http://localhost:3000
    },
);

//Socket
const io = new Server(server, {
    cors: corsOptions,
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

async function saveChatMessage(
    chatID,
    content,
    user,
    createdAt,
): Promise<boolean> {
    const messagesDB = client.db("voluntorcluster").collection("messages");
    const message = { chatId: chatID, content, user, createdAt };
    await messagesDB.insertOne(message).catch((err) => {
        return false;
    });
    return true;
}

//Routes
app.get("/api", (c) => {
    return c.json({ message: "Server connected" });
});

app.post('/api/signup', async (c) => {
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

  



  try{
    await users.insertOne(newUser);
  }
  catch(error){
    console.log(error);
    return c.json({ message: "Did not work" }, 201);  
  }

  return c.json({ message: "Signup successful" }, 201); 
});

app.post("/api/signin", async (c) => {
    const { email, password } = await c.req.json();
    const database = client.db("voluntorcluster");
    const users = database.collection("user");

    //typechecks for bcript
    const userEmail = await users.findOne({ email: email });
    if (!userEmail) {
        console.error("INCORRECT EMAIL");
        return c.json({ message: "Incorrect email" }, 400);
    }

    if (
        typeof userEmail.password !== "string" ||
        typeof password !== "string"
    ) {
        console.log(typeof userEmail.password);
        console.log(typeof password);
        return c.json({ message: "Email and password must be strings." }, 400);
    }
    const isPasswordValid = await bcrypt.compare(password, userEmail.password);
    if (!isPasswordValid) {
        console.error("INCORRECT PASSWORD");
        return c.json({ message: "Incorrect password" }, 400);
    }

    // everything is good so we create the JWT token
    const token = jwt.sign({ email: email, id: userEmail._id }, SECRET_KEY, {
        expiresIn: "30 days",
    });

    console.log("LOGIN SUCCESSFUL");

    return c.json(
        {
            message: "Login successful",
            token: token,
            email: email,
            _id: userEmail._id,
            role: userEmail.role,
            exp: "30 days",
        },
        200,
    );
});

app.post("/api/chats", async (c) => {
    const header = c.req.header("Authorization").split(" ")[1];
    if (!verifyToken(header).valid)
        return c.json({ message: "Unauthorized access" }, 401);

    const reqData = await c.req.json();

    const users = client.db("voluntorcluster").collection("user");
    const user: User = await users.findOne({ email: reqData.email });

    return c.json({ chatIDs: user.chats });
});

app.post("/api/messages/:chatID", async (c) => {
    const header = c.req.header("Authorization").split(" ")[1];
    if (!verifyToken(header).valid)
        return c.json({ message: "Unauthorized access" }, 401);

    const chatID = parseInt(c.req.param("chatID"));
    const messages = await client
        .db("voluntorcluster")
        .collection("messages")
        .find({ chatId: chatID })
        .project({ _id: 0, chatId: 0 })
        .toArray();

    return c.json({ messages: messages });
});

app.post("/api/chats/send", async (c) => {
    const header = c.req.header("Authorization").split(" ")[1];
    if (!verifyToken(header).valid)
        return c.json({ message: "Unauthorized access" }, 401);

    const {chatID, content, user, createdAt} = await c.req.json();
    
    // check if it contains profanity
    if(profanity.exists(content)){
        console.log("Profanity detected");
        return c.json({message: "Profanity detected"}, 400);
    }

    
    const res = await saveChatMessage(chatID, content, user, createdAt);
    if (!res) {
        console.log("Failed to send message");
        return c.json({ message: "Failed to send message" }, 400);
    }
    console.log("Sent message.");
    return c.json({ message: "Success" }, 200);
});

app.post("/api/user/user-data", async (c) => {
    // this is to give the user their data so they can modify it
    const { token } = await c.req.json();
    const database = client.db("voluntorcluster");
    const users = database.collection("user");

    const decoded: any = jwtDecode(token);
    const email = decoded.email;
    console.log("email: ", email);

    const userEmail = await users.findOne({ email: email });
    const validToken = await verifyToken(token);
    if (!validToken.valid) {
        return c.json({ message: "invalid token" }, 400);
    }

    return c.json(
        {
            message: "Data fetched",
            name: userEmail.name,
            role: userEmail.role,
            description: userEmail.description,
            language: userEmail.language,
            state: userEmail.state,
            GPA: userEmail.GPA,
            teaches: userEmail.teaches,
        },
        200,
    );
});

app.post("/api/user/user-modify", async (c) => {
    // user data is modifyed after settings changed
    const { token, name, role, description, language, state, GPA, teaches } =
        await c.req.json();
    const database = client.db("voluntorcluster");
    const users = database.collection("user");
    const decoded: any = jwtDecode(token);
    const email = decoded.email;
    console.log("email: ", email);
    const validToken = await verifyToken(token);
    if (!validToken.valid) {
        return c.json({ message: "invalid token" }, 400);
    }

    // if everything is OK then proceed!
    try {
        await users.updateOne(
            { email: email },
            {
                $set: {
                    name: name,
                    role: role,
                    description: description,
                    language: language,
                    state: state,
                    GPA: GPA,
                    teaches: teaches,
                },
            },
        );
    } catch (error) {
        console.log(error);
    }

    return c.json(
        {
            message: "Data updated",
        },
        200,
    );
});

app.post("/api/search-tutor", async (c) => {
    // this is to find tutors. Note that we always search for classes using lowercase ("math" not "Math")
    const { token, name, language, teaches } = await c.req.json();
    const database = client.db("voluntorcluster");

    const validToken = await verifyToken(token);
    if (!validToken.valid) {
        return c.json({ message: "error" }, 400);
    } // invalid token

    let lang = language;
    if (lang == "") {
        lang = "en";
    }
    const users = await database
        .collection("user")
        .find({ role: "tutor", language: lang, teaches: teaches }) // Match role and language
        .project({ _id: 1, name: 1, GPA: 1, description: 1, rating: 1 })
        .limit(10) // Limit to a maximum of 10 users
        .toArray(); // Convert to array

    return c.json(users);
});

app.post("/api/get-tutor", async (c) => {
    // this is to find tutors. Note that we always search for classes using lowercase ("math" not "Math")
    const { _id } = await c.req.json();
    const database = client.db("voluntorcluster");
    console.log("ID: ", _id);
    const user = await database.collection("user").findOne(
        { _id: new ObjectId(_id), role: "tutor" }, // I know ObjectId is deprecated but I couldnt do well with the new one
        { projection: { _id: 1, name: 1, GPA: 1, description: 1, rating: 1 } }, // Projection
    );

    console.log(user);

    return c.json(user);
});

io.on("connection", (socket) => {
    console.log("A user connected: " + socket.id);
    activeUsers.add(socket.id);
    chatRooms.set(socket.id, "-1");

    socket.on("joinChatRoom", (arg) => {
        if (chatRooms[socket.id] == "-1") socket.leave(chatRooms[socket.id]);
        chatRooms.set(socket.id, arg);
        socket.join(arg);
    });

    socket.on("send", (arg) => {
        const id = arg.chatID.toString();
        socket.to(id).emit("newMessage", arg);
    });

    socket.on("disconnect", () => {
        activeUsers.delete(socket.id);
        chatRooms.delete(socket.id);
        console.log("user disconnected: " + socket.id);
    });
});

/*app.get('/api/ws',
    upgradeWebSocket((c) => {
        return {
            onOpen(event, ws) {
                console.log("A user has connected");
            },
            onMessage(evt, ws) {
                const data : ChatMessageData = JSON.parse(evt.data);
                const toSend = {header: "NewMessage", data: data}
                ws.send(JSON.stringify(toSend));
            },
            onClose: () => {
                console.log("Connection closed");
            }
        }
    })
);

injectWebSocket(server);*/

app.post("/api/user/start-chat", async (c) => {
    // user data is modifyed after user clicks to start a new chat
    const { token, _id, tutorName } = await c.req.json(); // token is the person starting the chat, _id is the person they wanna chat with
    const database = client.db("voluntorcluster");
    const users = database.collection("user");
    const chats = database.collection("chats");
    const decoded: any = jwtDecode(token);
    const email = decoded.email;
    const userEmail = await users.findOne({ email: email });
    console.log("email: ", email);
    const validToken = await verifyToken(token);
    if (!validToken.valid) {
        return c.json({ message: "invalid token" }, 400);
    }

    // if everything is OK then proceed!
    const newId = Math.random() + Math.random() * 10000;
    try {
        await users.updateOne(
            // update user
            { email: email },
            { $push: { chats: newId } },
        );
        await users.updateOne(
            // update tutor
            { _id: new ObjectId(_id) },
            { $push: { chats: newId } },
        );
        console.log("updated", _id);

        const newChat = {
            chatID: newId,
            participats: [userEmail.name, tutorName],
            createdAt: new Date(),
        };

        await chats.insertOne(newChat);
    } catch (error) {
        console.log(error);
    }
    console.log("Chat created", newId);
    return c.json(
        {
            message: "Chat created",
            newId: newId,
        },
        200,
    );
});
