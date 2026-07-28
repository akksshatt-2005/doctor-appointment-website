import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const realClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      // If we failed multiple times, switch to fallback and stop spamming reconnects
      if (retries > 3) {
        useFallback = true;
        return new Error('Redis connection lost permanently, using fallback.');
      }
      return Math.min(retries * 100, 1000);
    }
  }
});

let useFallback = false;
let isConnected = false;

const memoryStore = new Map();
const memoryClient = {
  isFallback: true,
  on: (event, handler) => {},
  connect: async () => {},
  disconnect: async () => {},
  get: async (key) => {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expires && Date.now() > entry.expires) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  set: async (key, value, options) => {
    let expires = null;
    if (options && options.EX) {
      expires = Date.now() + options.EX * 1000;
    }
    memoryStore.set(key, { value: String(value), expires });
    return 'OK';
  },
  incr: async (key) => {
    const entry = memoryStore.get(key);
    let val = 0;
    if (entry && (!entry.expires || Date.now() <= entry.expires)) {
      val = parseInt(entry.value, 10) || 0;
    }
    val += 1;
    memoryStore.set(key, { value: String(val), expires: entry ? entry.expires : null });
    return val;
  },
  del: async (key) => {
    memoryStore.delete(key);
    return 1;
  }
};

realClient.on('error', (err) => {
  console.warn('Redis connection issue, switching to in-memory fallback:', err.message);
  useFallback = true;
});

export async function connectRedis() {
  if (isConnected || useFallback) return;

  try {
    const connectPromise = realClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 2000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    
    isConnected = true;
    console.log('Connected to Redis successfully.');
  } catch (error) {
    console.warn('Failed to connect to Redis, switching to in-memory fallback store:', error.message);
    useFallback = true;
  }
}

// Proxy to dynamically route calls to either Redis or the in-memory fallback
const redisClient = new Proxy(realClient, {
  get(target, prop) {
    if (useFallback) {
      return Reflect.get(memoryClient, prop);
    }
    return Reflect.get(target, prop);
  }
});

export { redisClient };
export default redisClient;
