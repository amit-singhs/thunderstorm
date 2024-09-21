import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import apiKeyMiddleware from "./middlewares/apiKeyAuthMiddleware";
import { JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import supabase from "./supabaseClient";
import { generateToken, verifyToken } from "./utils/jwtUtils";
import { sendEmail } from "./utils/emailUtils";
import rateLimit from "@fastify/rate-limit";
import fastifyCookie from '@fastify/cookie';

interface EmailRequestBody {
  email?: string;
}

const app = Fastify({
  logger: true,
  maxParamLength: 300,
});

// Register the rate limiting plugin first
app.register(rateLimit, {
  max: 1, // Maximum 1 requests
  timeWindow: "1 minute", // Per minute
  keyGenerator: (request) => {
    return request.ip; // Rate limit based on the client's IP address
  },
  global: false, // Apply to all routes
});

// Register the middleware
app.addHook("onRequest", apiKeyMiddleware);
app.register(fastifyCookie);

// Define a route to test the server
app.get("/hello", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/plain").send("Hello, World!");
});

app.get("/welcome", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply
    .status(200)
    .type("text/plain")
    .send("Hello Universe, we welcome you all !!");
});

// Define the root route
app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/html").send(html);
});

// The login route, through email
app.post(
  "/login",
  async (
    request: FastifyRequest<{ Body: { email: string } }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    const { data: existingData, error: fetchError } = await supabase
      .from("email_verification")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return reply.status(500).send({
        error: "Error fetching email data",
        details: fetchError.message,
      });
    }

    if (fetchError && fetchError.code === "PGRST116") {
      return reply
        .status(404)
        .send({ error: "Email not registered in the app." });
    }

    if (existingData) {
      if (!existingData.verified) {
        return reply.status(403).send({
          error: "The email is not verified.",
        });
      }

      let newToken = "";
      try {
        newToken = generateToken({ email, id: existingData.id }, "1h");
        
        // Set the cookie
        reply.setCookie('access-token', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', // Set to true in production
          path: '/', // Make cookie accessible in all routes
          sameSite: 'lax', // CSRF protection
        });

        return reply.send({ status: "success" });
      } catch (error) {
        console.error("Token generation error: ", error);
        return reply.status(500).send({ error: "Internal Server Error" });
      }
    }
  }
);

app.post(
  "/update-token",
  async (
    request: FastifyRequest<{ Body: EmailRequestBody }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    // Check if the email is provided
    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Query Supabase for the email
    const { data: existingData, error: fetchError } = await supabase
      .from("email_verification")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // Handle errors other than 'no rows found'
      return reply.status(500).send({
        error: "Error fetching email data",
        details: fetchError.message,
      });
    }

    if (fetchError && fetchError.code === "PGRST116") {
      // Email not found
      return reply
        .status(404)
        .send({ error: "Email not registered in the app." });
    }

    if (existingData) {
      // Check if the email is verified
      if (!existingData.verified) {
        return reply.status(403).send({
          error: "The email is not verified, hence token cannot be updated.",
        });
      }

      // Generate a new token
      try {
        const newToken = generateToken({ email }, "1h");

        // Update Supabase with the new token
        const { data: updatedData, error: updateError } = await supabase
          .from("email_verification")
          .update({ token: newToken })
          .eq("email", email)
          .select();

        if (updateError) {
          return reply.status(500).send({
            error: "Error updating token",
            details: updateError.message,
          });
        }

        // Send the response with the updated data
        return reply.send({ status: "success", data: updatedData });
      } catch (error) {
        console.error("Unexpected error while generating token:", error);
        return reply.status(500).send({ error: "Internal Server Error" });
      }
    }
  }
);

app.post(
  "/send-verification",
  async (
    request: FastifyRequest<{ Body: EmailRequestBody }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Generate a token
    const token = generateToken({ email }, "1h");

    // Insert the email and token in Supabase
    const { error: supabaseError } = await supabase
      .from("email_verification")
      .insert([{ email, token }])
      .select();

    if (supabaseError) {
      return reply.status(500).send({
        error: "Error updating or inserting email into Supabase",
        details: supabaseError.message,
      });
    }

    // Create the verification link
    const verificationLink = `http://localhost:3000/verify-email/${email}/${token}`;
    const subject = "Email Verification";
    const text = `Please verify your email by clicking on the following link: ${verificationLink}`;

    try {
      // Send the verification email
      await sendEmail(email, subject, text);
      return reply.send({
        status: "success",
        message: "Verification email sent",
      });
    } catch (mailError) {
      return reply.status(500).send({
        error: "Error sending verification email",
        details: mailError,
      });
    }
  }
);

app.get(
  "/verify-email/:email/:token",
  {
    config: {
      rateLimit: {
        max: 1, // Maximum 1 requests
        timeWindow: "1 minute", // Per minute
      },
    },
  },
  async (
    request: FastifyRequest<{ Params: { email: string; token: string } }>,
    reply: FastifyReply
  ) => {
    const { email, token } = request.params;

    try {
      // Check if email exists
      const { data: existingData, error: fetchError } = await supabase
        .from("email_verification")
        .select("*")
        .eq("email", email)
        .single();

      if (fetchError || !existingData) {
        return reply.status(404).send({ error: "Email not found" });
      }

      if (existingData.verified) {
        return reply.status(400).send({
          error: "Email is already verified, please proceed to use the app.",
        });
      }

      // Check if token matches
      if (existingData.token !== token) {
        return reply.status(400).send({ error: "Faulty token" });
      }

      // Check token expiration
      const decodedToken = (await verifyToken(token)) as JwtPayload;

      if (decodedToken.exp === undefined) {
        return reply
          .status(400)
          .send({ error: "Token does not have an expiration time" });
      }

      if (decodedToken.exp * 1000 < Date.now()) {
        return reply.status(400).send({
          error: "Token is expired, please resend verification link",
        });
      }

      // Token is still valid, update 'verified' flag
      const { data: updatedData, error: updateError } = await supabase
        .from("email_verification")
        .update({ verified: true })
        .eq("email", email)
        .select();

      if (updateError) {
        return reply
          .status(500)
          .send({ error: "Failed to update verification status" });
      }

      return reply.send({ status: "success", data: updatedData });
    } catch (error) {
      // Handle specific token errors
      if (error instanceof TokenExpiredError) {
        return reply.status(401).send({
          error:
            "The token is expired, please request another verification link.",
        });
      }
      // Handle other potential errors
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

// Export the Fastify instance as a Vercel function
export default async function handler(req: FastifyRequest, res: FastifyReply) {
  await app.ready(); // Ensure the app is ready to handle requests
  app.server.emit("request", req, res); // Emit the request to the Fastify instance
}

app.listen({ port: 3000, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});

// HTML content
const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css"
    />
    <title>Vercel + Fastify Hello World</title>
    <meta
      name="description"
      content="This is a starter template for Vercel + Fastify."
    />
  </head>
  <body>
    <h1>Vercel + Fastify Hello World</h1>
    <p>
      This is a starter template for Vercel + Fastify. Requests are
      rewritten from <code>/*</code> to <code>/api/*</code>, which runs
      as a Vercel Function.
    </p>
    <p>
        For example, here is the boilerplate code for this route:
    </p>
    <pre>
<code>import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

app.get('/', async (req, res) => {
  return res.status(200).type('text/html').send(html)
})

export default async function handler(req: any, res: any) {
  await app.ready()
  app.server.emit('request', req, res)
}</code>
    </pre>
    <p>
      <a href="https://vercel.com/templates/other/fastify-serverless-function">
      Deploy your own
      </a>
      to get started.
  </body>
</html>
`;
