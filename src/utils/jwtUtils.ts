import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is missing. Please add JWT_SECRET in the environment variable.');
  }
  return secret;
};

// Function to generate JWT
export const generateToken = (payload: object, expiresIn: string | number = '1h') => {
  const secret = getSecret();
  return jwt.sign(payload, secret, { expiresIn });
};

// Function to verify JWT
export const verifyToken = (token: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const secret = getSecret();   
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      resolve(decoded);
    });
  });
};
