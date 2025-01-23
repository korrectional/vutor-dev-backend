import { Int32 } from "mongodb"

interface User {
    _id?: any,
    email?: string,
    password?: string,
    phone?: string,
    role?: string,
    chats?: Array<string>,
    description?: string,
    state?: string,
    GPA?: string,
    teaches?: Array<string>,
    rating?: Int32,
    created?: Date,
    langauge?: Array<string>
}

interface RChatData {
    chatID: number,
    messages: Array<any>
}

export { User, RChatData}