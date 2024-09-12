import nodemailer, { SentMessageInfo } from 'nodemailer';

// Create a transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  secure: false,
  port: 25,
  auth: {
    user: process.env.GMAIL_EMAIL_USER,  
    pass: process.env.GMAIL_EMAIL_PASS  
  }
});

// Function to send email
export const sendEmail = async (to: string, subject: string, text: string): Promise<SentMessageInfo> => {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error(`Failed to send email: ${error}`);
  }
};
