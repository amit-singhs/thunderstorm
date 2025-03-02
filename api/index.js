"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const fastify_1 = __importDefault(require("fastify"));
const apiKeyAuthMiddleware_1 = __importDefault(require("./middlewares/apiKeyAuthMiddleware"));
const supabaseClient_1 = __importDefault(require("./supabaseClient"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const app = (0, fastify_1.default)({
    logger: true,
    maxParamLength: 300,
});
// Register the middleware
app.addHook("onRequest", apiKeyAuthMiddleware_1.default);
app.register(cookie_1.default, {
    hook: "onRequest",
    parseOptions: {}, // options for parsing cookies
});
// Explicitly add CORS headers
app.addHook('onSend', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    reply.header('Access-Control-Allow-Credentials', 'true');
}));
// Register the rate limiting plugin first
app.register(rate_limit_1.default, {
    max: 1, // Maximum 1 requests
    timeWindow: "1 minute", // Per minute
    keyGenerator: (request) => {
        return request.ip; // Rate limit based on the client's IP address
    },
    global: false, // Apply to all routes
});
// Define a route to test the server
app.get("/hello", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type("text/plain").send("Hello, World!");
}));
app.get("/welcome", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply
        .status(200)
        .type("text/plain")
        .send("Hello Universe, we welcome you all to The Thunderstorm!!");
}));
// Define the root route
app.get("/", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type("text/html").send("Welcome to the root route of The Thunderstorm.");
}));
// Key Management Routes
app.post('/api/keys/setup', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { publicKey, pinHash, userId } = request.body;
        const { data, error } = yield supabaseClient_1.default
            .from('user_keys')
            .insert([
            {
                user_id: userId,
                public_key: publicKey,
                pin_hash: pinHash,
                is_active: true,
            },
        ])
            .select('id')
            .single();
        if (error)
            throw error;
        return reply.status(201).send({ keyId: data.id });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to setup key' });
    }
}));
app.get('/api/keys/active', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user_id = request.user.id;
        const { data, error } = yield supabaseClient_1.default
            .from('user_keys')
            .select('id, public_key')
            .eq('user_id', user_id)
            .eq('is_active', true)
            .single();
        if (error)
            throw error;
        if (!data)
            return reply.status(404).send({ error: 'No active key found' });
        return reply.send({
            keyId: data.id,
            publicKey: data.public_key,
        });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to fetch active key' });
    }
}));
app.post('/api/keys/rotate', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { publicKey, pinHash } = request.body;
        const user_id = request.user.id;
        // Start a transaction to update old keys and insert new one
        const { data, error } = yield supabaseClient_1.default.rpc('rotate_user_key', {
            p_user_id: user_id,
            p_public_key: publicKey,
            p_pin_hash: pinHash,
        });
        if (error)
            throw error;
        return reply.status(201).send({ keyId: data.id });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to rotate key' });
    }
}));
// Document Signing Routes
app.post('/api/documents/sign', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { documentId, signature, keyId } = request.body;
        const user_id = request.user.id;
        // Verify the key belongs to the user
        const { data: keyData, error: keyError } = yield supabaseClient_1.default
            .from('user_keys')
            .select('id')
            .eq('id', keyId)
            .eq('user_id', user_id)
            .single();
        if (keyError || !keyData) {
            return reply.status(403).send({ error: 'Invalid key ID' });
        }
        const { data, error } = yield supabaseClient_1.default
            .from('document_signatures')
            .insert([
            {
                document_id: documentId,
                signer_id: user_id,
                signature,
                key_id: keyId,
            },
        ])
            .select('id')
            .single();
        if (error)
            throw error;
        return reply.status(201).send({
            success: true,
            signatureId: data.id,
        });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to sign document' });
    }
}));
app.get('/api/documents/verify/:documentId', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { documentId } = request.params;
        const { data, error } = yield supabaseClient_1.default
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
        if (error)
            throw error;
        if (!data)
            return reply.status(404).send({ error: 'Signature not found' });
        return reply.send({
            isValid: true, // You might want to add additional validation logic here
            signerInfo: {
                userId: data.signer_id,
                signedAt: data.signed_at,
                publicKey: (_c = (_b = (_a = data.user_keys) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.public_key) !== null && _c !== void 0 ? _c : null
            },
        });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to verify document' });
    }
}));
// Export the Fastify instance as a Vercel function
function handler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        yield app.ready(); // Ensure the app is ready to handle requests
        app.server.emit("request", req, res); // Emit the request to the Fastify instance
    });
}
app.listen({ port: 3000, host: "localhost" }, (err, address) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
    app.log.info(`Server listening at ${address}`);
});
