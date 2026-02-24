import mongoose from "mongoose";
import logger from "../utils/logger.js";

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);    
        logger.info("MongoDB connected", { host: conn.connection.host });
    } catch (error) {
        logger.error("MongoDB connection failed", { error });
        process.exit(1);
    }
}

export default connectDB; 
