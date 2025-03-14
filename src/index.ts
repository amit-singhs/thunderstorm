import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import apiKeyMiddleware from "./middlewares/apiKeyAuthMiddleware";
import { JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import supabase from "./supabaseClient";
import rateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import {
  KeySetupRequest,
  KeyResponse,
  ActiveKeyResponse,
  DocumentSignRequest,
  DocumentSignResponse,
  DocumentVerifyResponse,
} from './types';
const app = Fastify({
  logger: true,
  maxParamLength: 300,
});
// Register the middleware
app.addHook("onRequest", apiKeyMiddleware);

app.register(fastifyCookie, {
  hook: "onRequest",
  parseOptions: {}, // options for parsing cookies
});

// Explicitly add CORS headers
app.addHook('onSend', async (request, reply) => {
  reply.header('Access-Control-Allow-Credentials', 'true');
})

// Register the rate limiting plugin first
app.register(rateLimit, {
  max: 1, // Maximum 1 requests
  timeWindow: "1 minute", // Per minute
  keyGenerator: (request) => {
    return request.ip; // Rate limit based on the client's IP address
  },
  global: false, // Apply to all routes
});


// Define a route to test the server
app.get("/hello", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/plain").send("Hello, World!");
});

app.get("/welcome", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply
    .status(200)
    .type("text/plain")
    .send("Hello Universe, we welcome you all to The Thunderstorm!!");
});

// Define the root route
app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/html").send("Welcome to the root route of The Thunderstorm.");
});

// Key Management Routes
app.post<{ Body: KeySetupRequest }>('/api/keys/setup', async (request, reply) => {
  try {
    const { publicKey, pinHash, authId } = request.body;

    const { data, error } = await supabase
      .from('user_keys')
      .insert([
        {
          auth_id : authId,
          public_key: publicKey,
          pin_hash: pinHash,
          is_active: true,
        },
      ])
      .select('key_id')
      .single();

    if (error) throw error;

    return reply.status(201).send({ userId: data.key_id });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to setup key' });
  }
});

app.get<{ Params: { authId: string }, Reply: ActiveKeyResponse }>(
  '/api/keys/active/:authId', 
  async (request, reply) => {
    try {
      const { authId } = request.params;  // Get userId from params

      const { data, error } = await supabase
        .from('user_keys')
        .select('key_id, public_key')
        .eq('auth_id', authId)  // Use the userId from params
        .eq('is_active', true)
        .single();

      if (error) throw error;
      if (!data) return reply.status(404).send({ error: 'No active key found' });

      return reply.send({
        keyId: data.key_id,
        publicKey: data.public_key,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch active key' });
    }
});

app.post<{ Body: KeySetupRequest }>('/api/keys/generateNew', async (request, reply) => {
  try {
    const { publicKey, pinHash, authId } = request.body;
    const { data, error } = await supabase
      .from('user_keys')
      .insert([
        {
          auth_id : authId,
          public_key: publicKey,
          pin_hash: pinHash,
          is_active: true,
        },
      ])
      .select('key_id')
      .single();

    if (error) throw error;

    return reply.status(201).send({ keyId: data.key_id });
  } catch (error) {
    return reply.status(500).send({ error: 'Failed to rotate key' });
  }
});

// Add this after your other key management routes
app.post<{ Body: { authId: string } }>('/api/keys/deactivate', async (request, reply) => {
  try {
    const { authId } = request.body;

    const { data, error } = await supabase
      .from('user_keys')
      .update({ is_active: false })
      .eq('auth_id', authId)
      .eq('is_active', true)
      .select('is_active')
      .single();

    if (error) throw error;
    if (!data) return reply.status(404).send({ error: 'No active key found' });

    return reply.status(200).send({ 
      isActive: data.is_active 
    });
  } catch (error) {
    request.log.error('Error deactivating keys:', error);
    return reply.status(500).send({ error: 'Failed to deactivate keys' });
  }
});

// Document Signing Routes
app.post<{ Body: DocumentSignRequest }>('/api/documents/sign', async (request, reply) => {
  try {
    const { documentId, signature, keyId } = request.body;
    // const user_id = request.user.id;

    // Verify the key belongs to the user
    const { data: keyData, error: keyError } = await supabase
      .from('user_keys')
      .select('auth_id')
      .eq('key_id', keyId)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return reply.status(403).send({ error: 'Invalid key ID' });
    }

    const { data, error } = await supabase
      .from('document_signatures')
      .insert([
        {
          document_id: documentId,
          signer_id: keyData.auth_id,
          signature,
          key_id: keyId,
        },
      ])
      .select('id')
      .single();

    if (error) throw error;

    return reply.status(201).send({
      success: true,
      signatureId: data.id,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to sign document' });
  }
});

app.get<{ Params: { documentId: string } }>('/api/documents/verify/:documentId', async (request, reply) => {
  try {
    const { documentId } = request.params;

    const { data, error } = await supabase
      .from('document_signatures')
      .select(`
        id,
        signature,
        signed_at,
        signer_id,
        user_keys (
          public_key
        )
      `)
      .eq('document_id', documentId)
      .single();

    if (error) throw error;
    if (!data) return reply.status(404).send({ error: 'Signature not found' });

    return reply.send({
      isValid: true, // You might want to add additional validation logic here
      signerInfo: {
        userId: data.signer_id,
        signedAt: data.signed_at,
        publicKey: data.user_keys?.[0]?.public_key ?? null
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to verify document' });
  }
});

// Export the Fastify instance as a Vercel function
export default async function handler(req: FastifyRequest, res: FastifyReply) {
  await app.ready(); // Ensure the app is ready to handle requests
  app.server.emit("request", req, res); // Emit the request to the Fastify instance
}

app.listen({ port: 3000, host: "localhost" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
