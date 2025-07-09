import mongoose from 'mongoose'
const UserSchema = new mongoose.Schema({
    username : {
        type : String,
        required: true,
        unique : true
    },
    name : {
        type : String,
        required:true
    },
    age :{
        type : Number,
        required : true,
    },
    email : {
        type : String,
        required : true,
        unique : true,
    },
    password : {
        type : String,
        required : true,
    }
    
},{timestamps : true});

export const User = mongoose.model('User',UserSchema);