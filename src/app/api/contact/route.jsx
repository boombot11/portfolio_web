import nodemailer from 'nodemailer';

export  async function POST(req, res) {
    
  if (req.method !== 'POST') {
    return Response('Only POST requests allowed', {
        status: 405,
      },)
  }


  // Nodemailer transport configuration
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.RECEIVER_EMAIL,
    subject: 'New Contact Form Submission',
    text: `message`,
  };

  try {
    await transporter.sendMail(mailOptions);
   return  new Response('Sent email', {
        status: 200,
      },)
  } catch (error) {
    console.error('Error sending email:', error);
   return  new Response('Error'+error, {
        status: 400,
      })
  }
}
