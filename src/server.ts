import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import { jwtDecode } from "jwt-decode";
import { profanity } from "@2toad/profanity";
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Int32 } from "mongodb";

interface User { // I put them over here so its easier to deploy
    _id?: any;
    email?: string;
    password?: string;
    phone?: string;
    role?: string;
    chats?: Array<string>;
    description?: string;
    state?: string;
    GPA?: string;
    teaches?: Array<string>;
    rating?: Int32;
    created?: Date;
    langauge?: Array<string>;
}

interface ChatMessageData {
    chatId: Int32;
    content: string;
    user: string;
    createdAt: Date;
}

interface RChatData {
    chatID: number;
    messages: Array<any>;
}
config();

// setup mongodb
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

//Manage current users
let activeUsers = new Set();
let chatRooms = new Map<string, string>();

// setup jwt
const SECRET_KEY = process.env.JWT_SECRET;

// setup hono
const app = new Hono();

const PORT = 3000;
const corsOptions = {
    origin: ["http://localhost:5173", "http://localhost:80", "http://voluntors.org", "https://voluntors.org","http://api.voluntors.org","http://dev.voluntors.org"],
};

//Runs the Server
app.use("/api/*", cors(corsOptions));

const server = serve(
    {
        fetch: app.fetch,
        port: PORT,
    }
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

app.post("/api/hello", async (c) => {
    // this gives the user a hello world, but also logs their last visit to the website
    const { token } = await c.req.json();
    const decoded: any = jwtDecode(token);
    const email = decoded.email;
    const database = client.db("voluntorcluster");
    const users = database.collection("user");
    try {
        const thisUser = await users.findOne({ email: email });
        if (thisUser.private_last_visit) {
            return c.json({ message: "Server connected" });
        }
        await users.updateOne(
            { email: email },
            {
                $set: {
                    last_visit: new Date(),
                },
            },
        );
    } catch (error) {
        console.log(error);
    }

    return c.json({ message: "Server connected" });
});

app.post("/api/signup", async (c) => {
    const { email, password, phone, fName, lName, isTutor } =
        await c.req.json();
    const database = client.db("voluntorcluster");
    const users = database.collection("user");

    const exists = await users.findOne({ email: email });
    if (exists) {
        return c.json({ message: "User already exists" }, 400);
    }

    const pass = await hashPwd(password);

    const newUser = {
        email,
        password: pass, // Store hashed password
        name: fName + " " + lName,
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
        rating: 2.5,
        rated: 1, // so we can count the average rating
        number_of_students: 0, // stat for tutors

        // managment stuff
        private_last_visit: false,
        last_visit: new Date(),
        profanity: 0,
        banned: false,

        // stats
        number_of_reviews: 0, 
        number_of_chats: 0,
        number_of_messages: 0,
        number_of_visits: 1,
        number_of_tutors: 0,

        // reviews
        reviews: [], // [names of tutors]. This exists just to make sure user cant give review twice
        reviews_allowed: [], // [names of tutors]. User had enough communication with this tutor to give a review

        createdAt: new Date(),
    };

    try {
        await users.insertOne(newUser);
    } catch (error) {
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
        return c.json({ message: "Incorrect email" }, 401);
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
        return c.json({ message: "Incorrect password" }, 401);
    }
    if(userEmail.banned) {
        console.error("User is banned");
        return c.json({ message: "User is banned" }, 400);
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
            name: userEmail.name,
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
    let chatParticipants = [];
    const chats = client.db("voluntorcluster").collection("chats");
    for(let i = 0; i < user.chats.length; i++) {
        if(user.chats[i] == null || user.chats[i] == '1') continue;
        const chat = await chats.findOne({ chatID: user.chats[i] });
        if(chat == null) continue; //If the chat Id is invalid.
        chatParticipants.push(chat.participants);
    }

    return c.json({ chatIDs: user.chats, chatParticipants: chatParticipants });
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
    
    const { chatID, content, user, createdAt } = await c.req.json();
    const users = client.db("voluntorcluster").collection("user");
    const userEmail = await users.findOne({ email: user });

    // check if it contains profanity
    if (profanity.exists(content)) {
        console.log("Profanity detected");
        if(userEmail == null){
            console.log("This shouldnt be possible, its a hacker AAAAAAAAAAAAAAAAAAAAAAAAAA")
        }
        await users.updateOne(
            { email: user },
            {
                $set: {
                    profanity: userEmail.profanity + 1,
                },
            },);
        if(userEmail.profanity > 5){
            console.log("User banned");
            await users.updateOne(
                { email: user },
                {
                    $set: {
                        banned: true,
                    },
                },);
        }
        return c.json({ message: "Profanity detected" }, 400);
    }

    if(user != "SYSTEM"){   
        if(userEmail.banned){
            console.log("User is banned");
            return c.json({ message: "User is banned" }, 400);
        }
    }
        
    const res = await saveChatMessage(chatID, content, user, createdAt);
    if (!res) {
        console.log("Failed to send message");
        return c.json({ message: "Failed to send message" }, 400);
    }
    console.log("Sent message.");
    return c.json({ message: "Success" }, 200);
});

app.post("/api/chats/upload", async (c) => {
    const header = c.req.header("Authorization").split(" ")[1];
    if (!verifyToken(header).valid)
        return c.json({ message: "Unauthorized access" }, 401);

    const formData = await c.req.formData();
    const chatID = formData.get('chatID');
    const content = formData.get('content');
    const user = formData.get('user');
    const createdAt = formData.get('createdAt');
    const file = formData.get('file') as File;

    if (!file) return c.json({ error: 'No file uploaded' }, 400);
    console.log("File uploading");
    const filePath = `./uploads/${randomUUID()}-${file.name}`;
    console.log(filePath);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log("Written FileSync")
    const fileURL = `uploads/${path.basename(filePath)}`;
    console.log(fileURL);

    return c.json({ filePath, fileURL }, 200);

});

app.get("/api/uploads/:filename", async (c) => {
    
    const filePath = path.join('./uploads', c.req.param('filename'));


    if (!fs.existsSync(filePath)) {
        return c.json({ error: 'File not found' }, 404);
    }


    return c.body(fs.readFileSync(filePath), 200, { 'Content-Type': 'application/octet-stream' });


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
    console.log("Searching for tutors with parameters:", name, lang, teaches);
    const users = await database
        .collection("user")
        .find({ role: "tutor", teaches: teaches }) // Match role and language
        .project({ _id: 1, name: 1, GPA: 1, description: 1, rating: 1 })
        .limit(10) // Limit to a maximum of 10 users
        .toArray(); // Convert to array
    console.log(users);
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

//If a user connects
io.on("connection", (socket) => {
    console.log("A user connected: " + socket.id);
    activeUsers.add(socket.id);
    chatRooms.set(socket.id, "-1");

    //If a user requests to start a chat
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

    const sameChat = await chats.findOne({ participants: [userEmail.name, tutorName] });
    if(sameChat != null){
        return c.json(
            {
                message: "You already have a chat with this person",
            },
            400,
        );
    }
    

    // if everything is OK then proceed!
    //const name = userEmail.name + " and " + tutorName + "|" + new Date().getTime();
    const newId = Math.floor(Math.random() * 10000000);
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
            participants: [userEmail.name, tutorName],
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


app.post("/api/messages/rate/:chatID/", async (c) => {
    const chatID = parseInt(c.req.param("chatID"));


    // first step is to get the chat item
    const chatCollection = client.db("voluntorcluster").collection("chats");
    const chat = chatCollection.findOne({ chatID: chatID });

    // now using the chat item we will find the participant that is not the user
    const { userName } = await c.req.json();
    let tutor = chat.participants[0];
    if(chat.participants[1] != userName){tutor = chat.participants[1];}

    // now we check if the user can vote 
    const userCollection = client.db("voluntorcluster").collection("user");
    const userItem = await userCollection.findOne({ name: userName })


    // now we will find that participant's item (by the way this is risky)
    const tutorItem = await userCollection.findOne({ name: tutor })
    
    // we found the tutor! 
}) // I WILL RESUME
