const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

async function startMongo() {
  console.log('Starting MongoDB Memory Server...');
  
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017 },
  });

  const uri = mongod.getUri();
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key
NODE_ENV=test
PORT=8080
`;

  fs.writeFileSync('.env.test', envContent);
  fs.writeFileSync('.mongo-pid.json', JSON.stringify({ port: 27017 }));
  
  console.log(`MongoDB started: ${uri}`);
  console.log('Created .env.test file');
  
  // Keep process alive
  process.on('SIGTERM', async () => {
    await mongod.stop();
    process.exit(0);
  });
}

startMongo().catch(console.error);
