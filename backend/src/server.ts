import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';
import { bootstrapDefaultUsers } from './services/bootstrapUsers.js';

await mongoose.connect(env.MONGODB_URI);
await bootstrapDefaultUsers();
app.listen(env.PORT, () => {
  console.log(`API Aluno Atleta disponível na porta ${env.PORT}`);
});
