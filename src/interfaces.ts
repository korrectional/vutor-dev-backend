import { Int32 } from "mongodb"

interface User {
    _id?: any,
    email?: string,
    password?: string,
    created?: Date,
    chats?: Array<string>
}

interface RChatData {
    chatID: number,
    messages: Array<any>
}

export { User, RChatData}