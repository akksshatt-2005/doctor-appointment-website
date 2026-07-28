import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({
  url: redisUrl
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

let isConnected = false;

export async function connectRedis() {
  if (isConnected) return redisClient;
  
  try {
    await redisClient.connect();
    isConnected = true;
    console.log('Connected to Redis successfully.');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
  return redisClient;
}

export { redisClient };
export default redisClient;
