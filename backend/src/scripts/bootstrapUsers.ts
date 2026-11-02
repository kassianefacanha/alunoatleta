import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { bootstrapDefaultUsers } from '../services/bootstrapUsers.js';

await mongoose.connect(env.MONGODB_URI);
try {
  await bootstrapDefaultUsers();
} finally {
  await mongoose.disconnect();
}
